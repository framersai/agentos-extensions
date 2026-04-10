// @ts-nocheck
/**
 * @file SemanticEndpointDetector.ts
 * @description IEndpointDetector implementation that combines the heuristic
 * detector's punctuation and backchannel rules with LLM-based turn-completeness
 * classification for ambiguous cases.
 *
 * Detection strategy (in priority order):
 *  1. **Backchannel** — recognised phrases emitted as `backchannel_detected`
 *     without advancing the turn.
 *  2. **Terminal punctuation** — immediate `turn_complete` with reason
 *     `'punctuation'`.
 *  3. **LLM classification** — invoked after `minSilenceBeforeCheckMs` of
 *     silence; `COMPLETE` fires `turn_complete` with reason `'semantic_model'`.
 *     `INCOMPLETE` defers to the hard silence timeout.
 *  4. **Silence timeout** — hard fallback after `silenceTimeoutMs`, reason
 *     `'silence_timeout'`.
 *
 * @module endpoint-semantic/SemanticEndpointDetector
 */

import { EventEmitter } from 'node:events';
import { TurnCompletenessClassifier } from './TurnCompletenessClassifier.js';
import type { SemanticEndpointConfig } from './types.js';

// ---------------------------------------------------------------------------
// Local type mirror — avoids a hard runtime dep on @framers/agentos
// These match the shapes in packages/agentos/src/voice-pipeline/types.ts
// ---------------------------------------------------------------------------

/**
 * Minimal VAD event shape required by this detector.
 * Mirrors `VadEvent` from `@framers/agentos` voice-pipeline types.
 */
interface VadEvent {
  /** Type of the VAD transition. */
  type: 'speech_start' | 'speech_end' | 'silence';
  /** Unix epoch millisecond timestamp of the transition. */
  timestamp: number;
  /** Optional raw energy level (implementation-defined). */
  energyLevel?: number;
  /** Origin of the VAD event. */
  source?: 'vad' | 'stt';
}

/**
 * Minimal transcript event shape required by this detector.
 * Mirrors `TranscriptEvent` from `@framers/agentos` voice-pipeline types.
 */
interface TranscriptEvent {
  /** Full transcript text for this event. */
  text: string;
  /** Aggregate confidence score in the range [0, 1]. */
  confidence: number;
  /** Word-level tokens (may be empty for interim events). */
  words: unknown[];
  /** `true` when this hypothesis is stable and will not be revised. */
  isFinal: boolean;
  /** Duration of the recognised speech segment, ms (final events only). */
  durationMs?: number;
}

/**
 * Semantic reason for turn completion.
 * Mirrors `EndpointReason` from `@framers/agentos` voice-pipeline types.
 */
type EndpointReason =
  | 'silence_timeout'
  | 'punctuation'
  | 'syntax_complete'
  | 'semantic_model'
  | 'manual'
  | 'timeout';

/**
 * Payload emitted on `turn_complete`.
 * Mirrors `TurnCompleteEvent` from `@framers/agentos` voice-pipeline types.
 */
interface TurnCompleteEvent {
  /** Final consolidated transcript for this turn. */
  transcript: string;
  /** Aggregate STT confidence in the range [0, 1]. */
  confidence: number;
  /** Total detected speech duration in milliseconds. */
  durationMs: number;
  /** The semantic reason that triggered turn completion. */
  reason: EndpointReason;
}

/**
 * Minimal IEndpointDetector interface required by this pack.
 * Mirrors `IEndpointDetector` from `@framers/agentos` voice-pipeline types.
 */
interface IEndpointDetector extends EventEmitter {
  readonly mode: 'acoustic' | 'heuristic' | 'semantic';
  pushVadEvent(event: VadEvent): void;
  pushTranscript(event: TranscriptEvent): void;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default silence timeout (ms) — hard fallback if the LLM returns INCOMPLETE. */
const DEFAULT_SILENCE_TIMEOUT_MS = 1_500;

/** Default delay (ms) between speech_end and LLM invocation. */
const DEFAULT_MIN_SILENCE_BEFORE_CHECK_MS = 500;

/** Terminal punctuation that indicates sentence completion. */
const TERMINAL_PUNCTUATION = /[.?!]$/;

/**
 * Normalised backchannel phrases that indicate acknowledgement without a full
 * conversational turn. Compared after `.trim().toLowerCase()`.
 */
const BACKCHANNEL_PHRASES = new Set([
  'uh huh',
  'yeah',
  'okay',
  'ok',
  'mm hmm',
  'mmhmm',
  'mhm',
  'mm-hmm',
  'right',
  'sure',
  'yep',
  'yup',
  'gotcha',
]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Semantic endpoint detector that augments heuristic rules with LLM-based
 * turn-completeness classification.
 *
 * ### Events emitted
 * - `'turn_complete'` ({@link TurnCompleteEvent}) — user turn has ended.
 * - `'backchannel_detected'` (`{ text: string }`) — backchannel phrase
 *   recognised; accumulation suppressed.
 *
 * @example
 * ```ts
 * const detector = new SemanticEndpointDetector(
 *   async (prompt) => callMyLLM(prompt),
 *   { minSilenceBeforeCheckMs: 600, silenceTimeoutMs: 2000 }
 * );
 * detector.on('turn_complete', (e) => console.log(e.reason));
 * ```
 */
export class SemanticEndpointDetector extends EventEmitter implements IEndpointDetector {
  /** Active detection strategy label. */
  readonly mode: IEndpointDetector['mode'] = 'semantic';

  /** LLM-backed completeness classifier. */
  private readonly classifier: TurnCompletenessClassifier;

  /** Resolved silence timeout (ms) — hard fallback. */
  private readonly silenceTimeoutMs: number;

  /** Silence duration (ms) before invoking the LLM classifier. */
  private readonly minSilenceBeforeCheckMs: number;

  // ---------------------------------------------------------------------------
  // Mutable state (reset on each turn)
  // ---------------------------------------------------------------------------

  /** Accumulated final transcript text for the current turn. */
  private accumulatedText = '';

  /** Whether VAD reports active speech. */
  private speechActive = false;

  /**
   * Handle to the "check" timer — fires after `minSilenceBeforeCheckMs` and
   * invokes the LLM classifier.
   */
  private checkTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Handle to the hard silence-timeout timer — fires after `silenceTimeoutMs`.
   */
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Wall-clock timestamp (ms) when speech began for the current turn. */
  private turnStartMs: number | null = null;

  /** Confidence score from the most recent final STT transcript. */
  private lastConfidence = 1;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * @param llmCall — Async function that sends a prompt to an LLM and resolves
   *                  with the raw response text.
   * @param config  — Optional configuration overrides.
   */
  constructor(
    llmCall: (prompt: string) => Promise<string>,
    config: SemanticEndpointConfig = {},
  ) {
    super();

    this.silenceTimeoutMs = config.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;
    this.minSilenceBeforeCheckMs =
      config.minSilenceBeforeCheckMs ?? DEFAULT_MIN_SILENCE_BEFORE_CHECK_MS;

    this.classifier = new TurnCompletenessClassifier(llmCall, config.timeoutMs);
  }

  // ---------------------------------------------------------------------------
  // IEndpointDetector — pushTranscript
  // ---------------------------------------------------------------------------

  /**
   * Ingest a transcript event from the upstream STT session.
   *
   * Only final events (`isFinal: true`) affect state. Interim results are
   * silently ignored as they are unstable and arrive at high frequency.
   *
   * Recognised backchannel phrases are emitted as `'backchannel_detected'`
   * without being accumulated, preventing a subsequent `speech_end` from
   * triggering `turn_complete` for an acknowledgement.
   *
   * @param transcript — Transcript event from the upstream STT session.
   */
  pushTranscript(transcript: TranscriptEvent): void {
    if (!transcript.isFinal) {
      return;
    }

    const text = transcript.text;
    const normalised = text.trim().toLowerCase();

    if (BACKCHANNEL_PHRASES.has(normalised)) {
      this.emit('backchannel_detected', { text });
      return;
    }

    this.accumulatedText = text;
    this.lastConfidence = transcript.confidence;
  }

  // ---------------------------------------------------------------------------
  // IEndpointDetector — pushVadEvent
  // ---------------------------------------------------------------------------

  /**
   * Ingest a VAD (voice activity detection) event.
   *
   * - `speech_start` — marks the turn as active, cancels pending timers.
   * - `speech_end`   — if text has been accumulated, either fires immediately
   *                    on terminal punctuation, or schedules the LLM check
   *                    timer + hard silence-timeout timer.
   * - `silence`      — periodic heartbeats; no action required.
   *
   * @param event — VAD transition event.
   */
  pushVadEvent(event: VadEvent): void {
    switch (event.type) {
      case 'speech_start': {
        this.speechActive = true;
        this._clearAllTimers();
        if (this.turnStartMs === null) {
          this.turnStartMs = event.timestamp;
        }
        break;
      }

      case 'speech_end': {
        this.speechActive = false;

        if (!this.accumulatedText) {
          // No transcript available yet — nothing to evaluate.
          break;
        }

        if (TERMINAL_PUNCTUATION.test(this.accumulatedText)) {
          // Sentence-terminal punctuation: fire immediately, identical to the
          // heuristic detector.
          this._emitTurnComplete('punctuation', event.timestamp);
          break;
        }

        // Ambiguous case: schedule the LLM check and the hard silence fallback.
        this._startCheckTimer(event.timestamp);
        this._startSilenceTimer(event.timestamp);
        break;
      }

      case 'silence': {
        // Periodic heartbeat — no action; timers already handle delayed firing.
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // IEndpointDetector — reset
  // ---------------------------------------------------------------------------

  /**
   * Cancel all pending timers and clear accumulated state so the detector is
   * ready for the next turn.  Should be called by the pipeline after each
   * `turn_complete` event.
   */
  reset(): void {
    this._clearAllTimers();
    this.accumulatedText = '';
    this.speechActive = false;
    this.turnStartMs = null;
    this.lastConfidence = 1;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Schedule the LLM completeness check after `minSilenceBeforeCheckMs`.
   *
   * If the LLM returns `COMPLETE`, `turn_complete` is emitted with reason
   * `'semantic_model'` and both timers are cancelled.  If the LLM returns
   * `INCOMPLETE` or `TIMEOUT`, the check timer is done and the hard silence
   * timer (already running) continues as the fallback.
   *
   * @param speechEndTimestamp — Timestamp of the triggering `speech_end` event.
   */
  private _startCheckTimer(speechEndTimestamp: number): void {
    this._clearCheckTimer();

    // Capture state at scheduling time so async re-entrancy cannot corrupt it.
    const transcriptSnapshot = this.accumulatedText;

    this.checkTimer = setTimeout(async () => {
      this.checkTimer = null;

      // Guard: if the user resumed speaking before this timer fired, bail out.
      if (this.speechActive || this.accumulatedText !== transcriptSnapshot) {
        return;
      }

      let result: Awaited<ReturnType<TurnCompletenessClassifier['classify']>>;

      try {
        result = await this.classifier.classify(transcriptSnapshot);
      } catch {
        // Unexpected classifier error — let the silence timer handle it.
        return;
      }

      if (result === 'COMPLETE') {
        // Cancel the hard silence timer — LLM beat it.
        this._clearSilenceTimer();

        // Another guard: state may have changed while we awaited the LLM.
        if (this.accumulatedText === transcriptSnapshot && !this.speechActive) {
          this._emitTurnComplete('semantic_model', speechEndTimestamp);
        }
      }
      // INCOMPLETE or TIMEOUT → do nothing; the hard silence timer continues.
    }, this.minSilenceBeforeCheckMs);
  }

  /**
   * Start the hard silence-timeout timer.  When it fires, `turn_complete` is
   * emitted with reason `'silence_timeout'` regardless of the LLM result.
   *
   * @param speechEndTimestamp — Timestamp of the triggering `speech_end` event.
   */
  private _startSilenceTimer(speechEndTimestamp: number): void {
    this._clearSilenceTimer();

    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this._clearCheckTimer();
      this._emitTurnComplete('silence_timeout', speechEndTimestamp);
    }, this.silenceTimeoutMs);
  }

  /**
   * Emit `turn_complete` with the currently accumulated transcript and reset
   * internal state so the detector is clean for the next turn.
   *
   * State is reset **before** emitting so that re-entrant listeners see a
   * clean detector.
   *
   * @param reason             — Semantic reason driving turn completion.
   * @param speechEndTimestamp — Timestamp used to compute `durationMs`.
   */
  private _emitTurnComplete(reason: EndpointReason, speechEndTimestamp: number): void {
    const durationMs =
      this.turnStartMs !== null ? speechEndTimestamp - this.turnStartMs : 0;

    const event: TurnCompleteEvent = {
      transcript: this.accumulatedText,
      confidence: this.lastConfidence,
      durationMs,
      reason,
    };

    this.reset();

    this.emit('turn_complete', event);
  }

  /**
   * Cancel the LLM check timer without any other side effects.
   */
  private _clearCheckTimer(): void {
    if (this.checkTimer !== null) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Cancel the hard silence timer without any other side effects.
   */
  private _clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Cancel both the check timer and the silence timer.
   */
  private _clearAllTimers(): void {
    this._clearCheckTimer();
    this._clearSilenceTimer();
  }
}

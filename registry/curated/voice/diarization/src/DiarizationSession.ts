/**
 * @file DiarizationSession.ts
 * @description Live diarization session that wraps either a
 * {@link ProviderDiarizationBackend} or a {@link LocalDiarizationBackend}.
 *
 * The session implements {@link IDiarizationSession} and bridges the raw audio
 * / transcript inputs to the selected backend, forwarding `speaker_identified`
 * and `segment_ready` events to callers.
 *
 * @module diarization/DiarizationSession
 */

import { EventEmitter } from 'node:events';
import type { IDiarizationSession, AudioFrame, TranscriptEvent, DiarizedSegment, SpeakerIdentified } from './types.js';
import type { ProviderDiarizationBackend } from './ProviderDiarizationBackend.js';
import type { LocalDiarizationBackend } from './LocalDiarizationBackend.js';
import type { SpeakerEmbeddingCache } from './SpeakerEmbeddingCache.js';
import type { SlidingWindowExtractor } from './SlidingWindowExtractor.js';

// ---------------------------------------------------------------------------
// Discriminated union for the backend
// ---------------------------------------------------------------------------

/** Provider-delegated backend descriptor. */
interface ProviderBackendDescriptor {
  kind: 'provider';
  backend: ProviderDiarizationBackend;
}

/** Local-clustering backend descriptor. */
interface LocalBackendDescriptor {
  kind: 'local';
  backend: LocalDiarizationBackend;
  cache: SpeakerEmbeddingCache;
  extractor: SlidingWindowExtractor;
}

type BackendDescriptor = ProviderBackendDescriptor | LocalBackendDescriptor;

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * A live diarization session.
 *
 * Create instances via {@link DiarizationEngine.startSession} rather than
 * constructing directly.
 *
 * ### Events
 * - `speaker_identified` — payload: {@link SpeakerIdentified}
 * - `segment_ready`      — payload: {@link DiarizedSegment}
 * - `error`              — payload: `Error`
 * - `close`              — no payload
 */
export class DiarizationSession extends EventEmitter implements IDiarizationSession {
  // -------------------------------------------------------------------------
  // Private state
  // -------------------------------------------------------------------------

  private closed = false;

  /** Most recently identified speaker (used for transcript labelling in local mode). */
  private lastSpeakerId: string | null = null;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param descriptor - Resolved backend descriptor.
   */
  constructor(private readonly descriptor: BackendDescriptor) {
    super();

    if (descriptor.kind === 'local') {
      // Forward speaker_identified events from the local backend.
      descriptor.backend.on('speaker_identified', (payload: SpeakerIdentified) => {
        this.lastSpeakerId = payload.speakerId;
        this.emit('speaker_identified', payload);
      });

      descriptor.backend.start();
    }
  }

  // -------------------------------------------------------------------------
  // IDiarizationSession implementation
  // -------------------------------------------------------------------------

  /**
   * Push a raw audio frame into the pipeline.
   *
   * In local mode the frame is forwarded to the sliding-window extractor.
   * In provider mode this is a no-op.
   *
   * @param frame - Audio frame to process.
   */
  pushAudio(frame: AudioFrame): void {
    if (this.closed) return;

    if (this.descriptor.kind === 'local') {
      this.descriptor.extractor.pushAudio(frame);
    }
    // Provider mode: audio processing happens on the provider side.
  }

  /**
   * Attach speaker labels to a transcript event and emit a segment.
   *
   * In provider mode, word-level speaker labels are extracted directly.  In
   * local mode, the most recently identified speaker is used.
   *
   * @param event - Transcript event from the STT provider.
   * @returns The labelled {@link DiarizedSegment}, or `null` if no speaker
   *   information is available yet.
   */
  labelTranscript(event: TranscriptEvent): DiarizedSegment | null {
    if (this.closed) return null;

    let segment: DiarizedSegment | null = null;

    if (this.descriptor.kind === 'provider') {
      segment = this.descriptor.backend.pushTranscriptEvent(event);
    } else {
      // Local mode — use the last identified speaker.
      if (this.lastSpeakerId !== null) {
        segment = {
          speakerId: this.lastSpeakerId,
          text: event.text,
          startMs: event.timestamp,
          endMs: event.timestamp + event.text.length * 50, // rough estimate
          confidence: 0.7,
        };
      }
    }

    if (segment) {
      this.emit('segment_ready', segment);
    }

    return segment;
  }

  /**
   * Pre-register a known speaker voiceprint.
   *
   * Only has effect in local mode.  In provider mode, speaker IDs come
   * directly from the STT provider and this call is a no-op.
   *
   * @param id - Human-readable speaker name.
   * @param voiceprint - Reference embedding for this speaker.
   */
  enrollSpeaker(id: string, voiceprint: Float32Array): void {
    if (this.descriptor.kind === 'local') {
      this.descriptor.cache.enrollSpeaker(id, voiceprint);
    }
    // Provider mode: enrolment is handled by the provider; ignore here.
  }

  /**
   * Terminate the session and release all resources.
   *
   * After `close()` no further events are emitted.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.descriptor.kind === 'local') {
      this.descriptor.backend.stop();
      this.descriptor.extractor.flush();
    }

    this.emit('close');
    this.removeAllListeners();
  }
}

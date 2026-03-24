---
name: endpoint-semantic
description: Semantic endpoint detection — uses an LLM to classify whether the user's utterance is a complete thought, reducing false turn boundaries on mid-sentence pauses
category: voice
---

# Semantic Endpoint Detector Extension Pack

LLM-powered turn-boundary detection for the AgentOS voice pipeline. Extends the heuristic detector's punctuation and backchannel rules with a fast LLM classifier that decides whether an ambiguous utterance is complete or still in progress.

## How it works

1. **Punctuation (immediate)** — If the final transcript ends with `.`, `?`, or `!`, `turn_complete` fires immediately with reason `punctuation`, identical to the heuristic detector.
2. **Backchannel suppression** — Short acknowledgement phrases (`"uh huh"`, `"yeah"`, etc.) are emitted as `backchannel_detected` and do not advance the turn.
3. **LLM classification (ambiguous)** — On silence without terminal punctuation, after `minSilenceBeforeCheckMs` (default 500 ms), a small LLM prompt is sent asking whether the utterance is a complete thought. Results are LRU-cached keyed on the first 100 characters of the transcript.
   - `COMPLETE` → emit `turn_complete` with reason `semantic_model`.
   - `INCOMPLETE` → keep waiting; eventual silence timeout acts as the final fallback.
   - `TIMEOUT` (LLM call exceeds `timeoutMs`) → fall back to silence timeout.

## Setup

No API key is bundled — supply an `llmCall` function when constructing the detector directly, or configure an LLM provider in the AgentOS runtime.

## Configuration

```json
{
  "voice": {
    "endpointing": "semantic",
    "endpointingOptions": {
      "model": "gpt-4o-mini",
      "timeoutMs": 500,
      "minSilenceBeforeCheckMs": 500,
      "silenceTimeoutMs": 2000
    }
  }
}
```

### Options

| Option                    | Type     | Default | Description                                                         |
|---------------------------|----------|---------|---------------------------------------------------------------------|
| `model`                   | `string` | —       | LLM model identifier forwarded to the runtime LLM provider          |
| `timeoutMs`               | `number` | `500`   | Max ms to wait for the LLM before falling back to silence timeout   |
| `minSilenceBeforeCheckMs` | `number` | `500`   | Silence duration after speech_end before the LLM is queried         |
| `silenceTimeoutMs`        | `number` | `1500`  | Hard silence fallback after speech_end if LLM returns INCOMPLETE    |

## Events

| Event                 | Payload              | Description                                                  |
|-----------------------|----------------------|--------------------------------------------------------------|
| `turn_complete`       | `TurnCompleteEvent`  | User turn has ended; `reason` is `punctuation`, `semantic_model`, or `silence_timeout` |
| `backchannel_detected`| `{ text: string }`  | A backchannel phrase was recognised; accumulation suppressed |

## Programmatic usage

```ts
import { createSemanticEndpointDetector } from '@framers/agentos-ext-endpoint-semantic';

const detector = createSemanticEndpointDetector(
  async (prompt) => {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 32,
    });
    return res.choices[0].message.content ?? '';
  },
  { timeoutMs: 400, minSilenceBeforeCheckMs: 600 }
);

detector.on('turn_complete', (evt) => console.log('Turn done:', evt.reason));
```

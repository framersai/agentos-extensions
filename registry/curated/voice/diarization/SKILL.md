---
name: diarization
description: Speaker diarization — identifies and tracks who is speaking at each moment in an audio stream
category: voice
---

# Diarization Extension Pack

Speaker diarization for the AgentOS voice pipeline.  Supports two modes:

1. **Provider-delegated** — extracts speaker labels from STT provider word-level results (e.g. Deepgram with `diarize: true`).  Zero additional compute, no voiceprint model needed.
2. **Local clustering** — uses a sliding-window spectral-centroid voiceprint with agglomerative clustering, fully offline.  An ONNX x-vector model can be plugged in later without API changes.

## Setup

No API key required for local mode.  For provider mode, enable diarization on your STT provider (e.g. `providerOptions.diarize: true` on the Deepgram STT pack).

## Configuration

```json
{
  "voice": {
    "diarization": "local"
  }
}
```

To use provider-delegated diarization:

```json
{
  "voice": {
    "diarization": "provider",
    "stt": "deepgram",
    "providerOptions": { "diarize": true }
  }
}
```

### Speaker enrollment (optional)

Pre-register known speakers so the engine can label them by name instead of `Speaker_N`:

```ts
await session.enrollSpeaker('Alice', aliceVoiceprintFloat32Array);
await session.enrollSpeaker('Bob', bobVoiceprintFloat32Array);
```

## Events

| Event                 | Payload              | Description                                              |
|-----------------------|----------------------|----------------------------------------------------------|
| `speaker_identified`  | `SpeakerIdentified`  | Emitted whenever the active speaker label changes        |
| `segment_ready`       | `DiarizedSegment`    | A labelled audio or transcript segment is ready          |
| `error`               | `Error`              | Unrecoverable diarization error                          |
| `close`               | —                    | Session fully terminated                                 |

## Local backend feature extraction

The built-in feature extractor computes a 16-dimensional vector per 1.5 s window (0.5 s overlap):

- Dimensions 0–3: octave-band RMS energy (sub-bass, bass, mid, high)
- Dimensions 4–7: spectral centroid per octave band
- Dimensions 8–11: zero-crossing rate per octave band
- Dimensions 12–15: delta energy (frame-to-frame change) per octave band

This is intentionally lightweight.  Replace `LocalDiarizationBackend.extractSimpleEmbedding()` with an ONNX x-vector model for production-quality voiceprints.

## Clustering

`ClusteringStrategy` runs agglomerative merging whenever the centroid count exceeds `expectedSpeakers`.  Centroids with cosine similarity above `mergeThreshold` (default 0.85) are collapsed into a single speaker identity.

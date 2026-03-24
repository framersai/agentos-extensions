---
name: streaming-stt-deepgram
description: Real-time streaming speech-to-text via Deepgram WebSocket API
category: voice
---

# Deepgram Streaming STT

Real-time streaming speech-to-text using Deepgram's Nova-2 model via WebSocket.

## Setup

Set `DEEPGRAM_API_KEY` in your environment or agent secrets store.

## Features

- Sub-300 ms latency interim transcripts
- Native speaker diarization (word-level `speaker` labels)
- Automatic punctuation insertion
- Word-level timestamps and per-word confidence scores
- Auto-reconnect on connection drops (exponential back-off 100 ms → 5 s)
- Keyword boosting via `providerOptions.keywords`

## Configuration

In `agent.config.json`:

```json
{
  "voice": {
    "stt": "deepgram"
  }
}
```

Provider-specific options via `providerOptions`:

```json
{
  "voice": {
    "stt": "deepgram",
    "providerOptions": {
      "model": "nova-2",
      "diarize": true,
      "keywords": ["AgentOS:2", "Deepgram:1.5"],
      "endpointing": 300
    }
  }
}
```

## Events

| Event                  | Payload           | Description                                     |
|------------------------|-------------------|-------------------------------------------------|
| `transcript`           | `TranscriptEvent` | Every hypothesis (interim + final)              |
| `interim_transcript`   | `TranscriptEvent` | Non-final hypothesis                            |
| `final_transcript`     | `TranscriptEvent` | Stable, final hypothesis                        |
| `speech_start`         | —                 | First non-empty word in an utterance            |
| `speech_end`           | —                 | Deepgram `speech_final` flag raised             |
| `error`                | `Error`           | Unrecoverable provider error                    |
| `close`                | —                 | Session fully terminated                        |

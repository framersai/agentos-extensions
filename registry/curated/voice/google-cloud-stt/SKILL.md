---
name: google-cloud-stt
description: Batch speech-to-text via Google Cloud Speech-to-Text API
category: voice
---

# Google Cloud STT

Batch speech-to-text recognition using Google Cloud Speech-to-Text V1 API.

## Setup

Provide credentials via the `GOOGLE_CLOUD_STT_CREDENTIALS` secret. Accepts either:
- An absolute path to a service-account JSON key file (contains `/` or `\`)
- A raw JSON string with the service-account credentials

## Features

- LINEAR16 PCM audio transcription
- Configurable language code (BCP-47)
- Confidence scores and word-level alternatives
- Maps to standard `SpeechTranscriptionResult` shape

## Configuration

In `agent.config.json`:

```json
{
  "voice": {
    "stt": "google-cloud-stt"
  }
}
```

Provider-specific options via `providerOptions`:

```json
{
  "voice": {
    "stt": "google-cloud-stt",
    "providerOptions": {
      "language": "fr-FR"
    }
  }
}
```

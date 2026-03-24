---
name: google-cloud-tts
description: Text-to-speech synthesis via Google Cloud Text-to-Speech API
category: voice
---

# Google Cloud TTS

Text-to-speech synthesis using the Google Cloud Text-to-Speech API with MP3 output.

## Setup

Set `GOOGLE_CLOUD_TTS_CREDENTIALS` in your environment or agent secrets store.
Accepts an absolute path to a service-account JSON key file or an inline JSON credentials string.

## Features

- MP3 audio output (audio/mpeg)
- Configurable language code and voice name
- `listAvailableVoices()` to enumerate all supported voices
- Credential resolution identical to the STT pack (path or JSON string)

## Configuration

In `agent.config.json`:

```json
{
  "voice": {
    "tts": "google-cloud-tts"
  }
}
```

Provider-specific options:

```json
{
  "voice": {
    "tts": "google-cloud-tts",
    "providerOptions": {
      "languageCode": "en-GB",
      "voice": "en-GB-Neural2-A"
    }
  }
}
```

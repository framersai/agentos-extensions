---
name: amazon-polly
description: Neural text-to-speech via Amazon Polly
category: voice
---

# Amazon Polly TTS

Text-to-speech synthesis using Amazon Polly's Neural engine with MP3 output.

## Setup

Set the following secrets in your environment or agent secrets store:

| Secret              | Description              |
|---------------------|--------------------------|
| `AWS_ACCESS_KEY_ID` | IAM access key ID        |
| `AWS_SECRET_ACCESS_KEY` | IAM secret access key |
| `AWS_REGION`        | AWS region (default `us-east-1`) |

## Features

- Neural engine (high-quality, natural-sounding voices)
- MP3 audio output
- `listAvailableVoices()` to enumerate all Polly voices
- Default voice: `Joanna` (en-US, Neural)

## Configuration

In `agent.config.json`:

```json
{
  "voice": {
    "tts": "amazon-polly"
  }
}
```

Provider-specific options:

```json
{
  "voice": {
    "tts": "amazon-polly",
    "providerOptions": {
      "voice": "Matthew"
    }
  }
}
```

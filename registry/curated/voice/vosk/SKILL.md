# vosk — Offline STT Extension Pack

Provides offline speech-to-text via the [Vosk](https://alphacephei.com/vosk/) library.
Requires a pre-downloaded Vosk model directory.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `modelPath` | `~/.agentos/models/vosk/` | Path to the Vosk model directory |

## Features
- Fully offline — no network required after model download
- Streaming support (native Vosk recogniser)
- 16 kHz LINEAR16 PCM input

# piper — Offline TTS Extension Pack

Provides offline text-to-speech by spawning the [Piper](https://github.com/rhasspy/piper) binary.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `binaryPath` | `PIPER_BIN` env or `piper` | Path to the Piper executable |
| `modelPath` | `PIPER_MODEL_PATH` env or `~/.agentos/models/piper/en_US-lessac-medium.onnx` | ONNX model file |
| `maxBufferBytes` | `10485760` (10 MB) | Maximum WAV output size |
| `timeoutMs` | `30000` | Process timeout in milliseconds |

## Features
- Fully offline — no network required after model download
- Zero npm dependencies (uses `child_process.spawn`)
- Returns WAV audio (`audio/wav`)
- Cost always 0

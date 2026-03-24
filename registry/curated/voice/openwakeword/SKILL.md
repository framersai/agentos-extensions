# openwakeword — ONNX Wake-Word Extension Pack

Provides wake-word detection using [OpenWakeWord](https://github.com/dscripka/openWakeWord) ONNX models via `onnxruntime-node`.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `modelPath` | `OPENWAKEWORD_MODEL_PATH` env or `~/.agentos/models/openwakeword/hey_mycroft.onnx` | Path to ONNX model file |
| `threshold` | `0.5` | Detection probability threshold |
| `keyword` | `'hey mycroft'` | Human-readable keyword label |

## Features
- Fully offline — no network required
- Any ONNX-compatible wake-word model supported
- Configurable detection threshold
- Feature extraction: RMS energy + zero-crossing rate from 80 ms audio frames

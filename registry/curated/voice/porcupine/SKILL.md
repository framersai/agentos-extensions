# porcupine — Wake-Word Extension Pack

Provides wake-word detection via the [Picovoice Porcupine](https://picovoice.ai/platform/porcupine/) engine.

## Configuration

| Option | Description |
|--------|-------------|
| `accessKey` | **Required.** Picovoice access key from [console.picovoice.ai](https://console.picovoice.ai/) |
| `keywords` | Array of built-in keyword names (e.g. `['porcupine', 'bumblebee']`) |
| `sensitivities` | Per-keyword detection sensitivity in [0, 1] (default 0.5 each) |

## Features
- On-device, privacy-preserving detection (no audio sent to cloud)
- Stateless per-frame processing
- Configurable sensitivity per keyword

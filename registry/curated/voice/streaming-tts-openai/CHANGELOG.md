# @framers/agentos-ext-streaming-tts-openai

## 0.2.0

### Minor Changes

- [`63a0b28`](https://github.com/framersai/agentos-extensions/commit/63a0b286ba70176d09a1c073c4b496234e2f20b6) Thanks [@jddunn](https://github.com/jddunn)! - Complete voice pipeline extension packs:

  Streaming Pipeline:

  - Deepgram real-time STT via WebSocket API
  - Whisper chunked streaming STT with sliding window buffer
  - OpenAI streaming TTS with adaptive sentence chunking
  - ElevenLabs streaming TTS via WebSocket with continuation hints
  - Speaker diarization with provider delegation and local x-vector clustering
  - Semantic endpoint detection with LLM turn-completeness classifier

  Provider Ecosystem:

  - Google Cloud STT and TTS
  - Amazon Polly neural TTS
  - Vosk local offline STT
  - Piper local offline TTS (C++ binary)
  - Porcupine wake-word detection
  - OpenWakeWord ONNX wake-word detection

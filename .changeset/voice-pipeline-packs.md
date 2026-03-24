---
"@framers/agentos-ext-streaming-stt-deepgram": minor
"@framers/agentos-ext-streaming-stt-whisper": minor
"@framers/agentos-ext-streaming-tts-openai": minor
"@framers/agentos-ext-streaming-tts-elevenlabs": minor
"@framers/agentos-ext-diarization": minor
"@framers/agentos-ext-endpoint-semantic": minor
"@framers/agentos-ext-google-cloud-stt": minor
"@framers/agentos-ext-google-cloud-tts": minor
"@framers/agentos-ext-amazon-polly": minor
"@framers/agentos-ext-vosk": minor
"@framers/agentos-ext-piper": minor
"@framers/agentos-ext-porcupine": minor
"@framers/agentos-ext-openwakeword": minor
---

Complete voice pipeline extension packs:

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

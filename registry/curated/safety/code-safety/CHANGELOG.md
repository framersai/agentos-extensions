# @framers/agentos-ext-code-safety

## 0.2.0

### Minor Changes

- [`c35afe8`](https://github.com/framersai/agentos-extensions/commit/c35afe8c16fdf51df6ce2d0bb83de6cd702e3a8b) Thanks [@jddunn](https://github.com/jddunn)! - Implement all 5 guardrail extension packs with full detection logic:
  - PII Redaction: 4-tier detection (regex + keyword + NER + LLM)
  - Code Safety: OWASP regex patterns for SQL injection, XSS, command injection
  - ML Classifiers: toxicity/injection/NSFW via ONNX or LLM fallback
  - Topicality: embedding-based topic enforcement with LLM fallback
  - Grounding Guard: NLI-based hallucination detection against RAG sources

---
"@framers/agentos-ext-pii-redaction": minor
"@framers/agentos-ext-code-safety": minor
"@framers/agentos-ext-grounding-guard": minor
"@framers/agentos-ext-ml-classifiers": minor
"@framers/agentos-ext-topicality": minor
---

Implement all 5 guardrail extension packs with full detection logic:
- PII Redaction: 4-tier detection (regex + keyword + NER + LLM)
- Code Safety: OWASP regex patterns for SQL injection, XSS, command injection
- ML Classifiers: toxicity/injection/NSFW via ONNX or LLM fallback
- Topicality: embedding-based topic enforcement with LLM fallback
- Grounding Guard: NLI-based hallucination detection against RAG sources

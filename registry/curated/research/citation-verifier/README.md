# Citation Verifier

Verify claims in text against sources using semantic similarity. Supports web search fallback for unverifiable claims.

## Installation

```bash
npm install @framers/agentos-ext-citation-verifier
```

## Usage

```typescript
import { createExtensionPack } from '@framers/agentos-ext-citation-verifier';

const pack = createExtensionPack({
  config: {
    embedFn: async (texts) => myEmbeddingProvider.embed(texts),
  },
});
```

## Tool: `verify_citations`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Text containing claims to verify |
| `sources` | array | No | Sources to verify against (`{ title, content, url }`) |
| `webFallback` | boolean | No | Search the web for unverifiable claims |

### Example

```
User: "Verify this research summary"
Agent: verify_citations({
  text: "The Earth's core temperature is approximately 5,400°C. Mars has two moons.",
  sources: [
    { content: "Earth's inner core reaches temperatures of 5,400°C.", url: "https://example.com/earth" }
  ],
  webFallback: true
})
Result: {
  totalClaims: 2,
  supportedCount: 1,        // "Earth's core" matched the source
  unverifiableCount: 0,     // "Mars has two moons" verified via web
  summary: "2/2 claims verified (100%)"
}
```

## How It Works

1. **Claim extraction** — splits text into atomic factual claims using sentence boundaries
2. **Batch embedding** — embeds all claims + all sources in one call
3. **Cosine similarity matrix** — computes claim × source similarity
4. **Verdict assignment**:
   - `similarity >= 0.6` → **supported** (claim matches a source)
   - `similarity 0.3-0.6` → **weak** (partial match)
   - `similarity < 0.3` → **unverifiable** (no matching source)
5. **Web fallback** — for unverifiable claims, searches the web via FactCheckTool

## Verdicts

| Verdict | Meaning | Action |
|---------|---------|--------|
| `supported` | Claim semantically matches a source | Safe to present |
| `weak` | Partial match, lower confidence | Present with caveat |
| `unverifiable` | No source matches | Mark as "[unverified]" or search web |
| `contradicted` | Source contradicts the claim (via NLI) | Do not present as fact |

## Integration with Deep Research

When using the `deep_research` tool with `depth: "deep"`, citation verification runs automatically on the synthesized output. No explicit `verify_citations` call needed.

Configure in `agent.config.json`:

```json
{
  "queryRouter": {
    "verifyCitations": true
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERPER_API_KEY` | No | Enables web fallback for unverifiable claims |
| `TAVILY_API_KEY` | No | Alternative search provider for web fallback |

## Related

- **Skill**: `fact-grounding` — instructs the agent to verify claims before presenting
- **Guardrail**: `grounding-guard` — real-time NLI-based grounding (streaming)
- **Tool**: `fact_check` — web-based fact verification (single claim)

## License

MIT

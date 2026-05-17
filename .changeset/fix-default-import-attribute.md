---
"@framers/agentos-extensions": patch
---

Add `index.mjs` wrapper so `import x from '@framers/agentos-extensions'` works on every Node version without the `with { type: 'json' }` import attribute (Node 22+) or the deprecated `assert { type: 'json' }`. The wrapper reads `registry.json` via `fs` at runtime.

// Tiny wrapper so consumers can `import registry from '@framers/agentos-extensions'`
// without needing the `with { type: 'json' }` import attribute (Node 22+) or the
// older `assert { type: 'json' }` (deprecated). Reads registry.json at runtime
// via fs so it works on every supported Node version.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(join(__dirname, 'registry.json'), 'utf-8'));

export default registry;

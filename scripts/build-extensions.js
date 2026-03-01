#!/usr/bin/env node
/**
 * Compiles TypeScript for extension packages that have their own tsconfig.json.
 * Only builds extensions whose src/ has been modified more recently than dist/.
 */
import { execSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const registryDir = join(__dirname, '..', 'registry', 'curated');

function findExtensionDirs(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (existsSync(join(full, 'tsconfig.json')) && existsSync(join(full, 'src'))) {
      results.push(full);
    } else {
      // Recurse one level (e.g., channels/discord)
      for (const sub of readdirSync(full, { withFileTypes: true })) {
        const subFull = join(full, sub.name);
        if (sub.isDirectory() && existsSync(join(subFull, 'tsconfig.json')) && existsSync(join(subFull, 'src'))) {
          results.push(subFull);
        }
      }
    }
  }
  return results;
}

function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    try {
      const full = join(dir, entry.name);
      const st = statSync(full);
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch { /* skip */ }
  }
  return newest;
}

const extensions = findExtensionDirs(registryDir);
let built = 0;

for (const ext of extensions) {
  const srcTime = newestMtime(join(ext, 'src'));
  const distTime = newestMtime(join(ext, 'dist'));

  if (srcTime > distTime) {
    const label = relative(registryDir, ext);
    process.stdout.write(`  Building ${label}...`);
    try {
      execSync('npx tsc', { cwd: ext, stdio: 'pipe' });
      console.log(' ✓');
      built++;
    } catch (err) {
      console.log(' ✗');
      console.error(`    ${err.stderr?.toString().trim().split('\n')[0] || err.message}`);
    }
  }
}

if (built > 0) {
  console.log(`✅ Built ${built} extension(s)`);
} else {
  console.log('Extensions up to date');
}

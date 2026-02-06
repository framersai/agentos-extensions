<p align="center">
  <a href="https://agentos.sh"><img src="logos/agentos-primary-transparent-2x.png" alt="AgentOS" height="64" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://frame.dev" target="_blank" rel="noopener"><img src="logos/frame-logo-green-transparent-4x.png" alt="Frame.dev" height="64" /></a>
  <br>
  <small>by <a href="https://frame.dev" target="_blank" rel="noopener">Frame.dev</a></small>
</p>

# AgentOS Extensions

Official extension registry for the AgentOS ecosystem.

[![CI Status](https://github.com/framersai/agentos-extensions/workflows/CI%20-%20All%20Extensions/badge.svg)](https://github.com/framersai/agentos-extensions/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![API Docs](https://img.shields.io/badge/docs-TypeDoc-blue)](https://framersai.github.io/agentos-extensions/)

## Published Extensions

All extensions are published to npm under the `@framers` scope.

| Package | Description | npm |
|---------|-------------|-----|
| [`@framers/agentos-ext-auth`](./registry/curated/auth) | JWT authentication & subscription management | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-auth) |
| [`@framers/agentos-ext-anchor-providers`](./registry/curated/provenance/anchor-providers) | Solana on-chain provenance anchoring | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-anchor-providers) |
| [`@framers/agentos-ext-tip-ingestion`](./registry/curated/provenance/wunderland-tip-ingestion) | Tip content processing pipeline | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-tip-ingestion) |
| [`@framers/agentos-ext-web-search`](./registry/curated/research/web-search) | Multi-provider web search & fact-checking | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-web-search) |
| [`@framers/agentos-ext-web-browser`](./registry/curated/research/web-browser) | Browser automation & content extraction | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-web-browser) |
| [`@framers/agentos-ext-telegram`](./registry/curated/integrations/telegram) | Telegram Bot API integration | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-telegram) |
| [`@framers/agentos-ext-telegram-bot`](./registry/curated/communications/telegram-bot) | Telegram bot communications handler | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-telegram-bot) |
| [`@framers/agentos-ext-cli-executor`](./registry/curated/system/cli-executor) | Shell command execution & file management | ![npm](https://img.shields.io/npm/v/@framers/agentos-ext-cli-executor) |

## Repository Structure

```
agentos-extensions/
├── .changeset/            # Changesets for versioning & publishing
├── .github/workflows/     # CI, release, TypeDoc pages
├── logos/                 # Branding assets
├── templates/             # Starter templates for new extensions
│   ├── basic-tool/        # Single tool template
│   ├── multi-tool/        # Multiple tools template
│   ├── guardrail/         # Safety/compliance template
│   └── workflow/          # Multi-step process template
├── registry/
│   ├── curated/           # Official & verified extensions
│   │   ├── auth/          # Authentication & subscriptions
│   │   ├── communications/# Messaging (Telegram bot)
│   │   ├── integrations/  # External services (Telegram API)
│   │   ├── provenance/    # On-chain anchoring & tip ingestion
│   │   ├── research/      # Web search & browser automation
│   │   └── system/        # CLI executor
│   └── community/         # Community-contributed extensions
├── scripts/               # Registry build & scaffolding tools
├── registry.json          # Auto-generated extension manifest
├── pnpm-workspace.yaml    # Workspace packages for publishing
└── typedoc.json           # API docs config
```

## Quick Start

### Install an extension

```bash
npm install @framers/agentos-ext-web-search
```

### Use in your agent

```typescript
import { AgentOS } from '@framers/agentos';
import webSearch from '@framers/agentos-ext-web-search';

const agentos = new AgentOS();
await agentos.initialize({
  extensionManifest: {
    packs: [{
      factory: () => webSearch({ /* config */ })
    }]
  }
});
```

### Create a new extension

```bash
# Use the scaffolding script
pnpm run create-extension

# Or copy a template
cp -r templates/basic-tool registry/curated/category/my-extension
cd registry/curated/category/my-extension
pnpm install
pnpm run dev
```

## Releasing & Publishing

This repo uses [Changesets](https://github.com/changesets/changesets) for multi-package versioning and npm publishing. See [RELEASING.md](./RELEASING.md) for the full workflow.

### TL;DR

```bash
# 1. Make your changes to one or more extensions

# 2. Add a changeset describing what changed
pnpm changeset

# 3. Commit and push to master
git add . && git commit -m "feat: my changes" && git push

# 4. The GitHub Action opens a "Version Packages" PR
#    → Merge it to publish updated packages to npm
```

Each extension is versioned and published independently. A change to `web-search` does not bump `telegram`.

## Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Extension | `@framers/agentos-ext-{name}` | `@framers/agentos-ext-web-search` |
| Template | `@framers/agentos-template-{type}` | `@framers/agentos-template-basic-tool` |

## CI/CD

All extensions get free CI/CD via GitHub Actions:

- **CI** (`ci.yml`): Lint, test, typecheck on every PR
- **Release** (`release.yml`): Changesets auto-version PRs + npm publish on merge
- **TypeDoc** (`pages-typedoc.yml`): API docs deployed to [framersai.github.io/agentos-extensions](https://framersai.github.io/agentos-extensions/)
- **Extension validation** (`extension-validation.yml`): Manifest & structure checks
- **Dependabot**: Automated dependency updates with auto-merge for patches

## Quality Standards

### All Extensions

- TypeScript with strict mode
- >80% test coverage
- MIT license
- No hardcoded secrets

### Additional for Curated

- Professional code review
- Performance benchmarks
- Integration tests
- Migration guides

## Documentation

- [API Reference (TypeDoc)](https://framersai.github.io/agentos-extensions/)
- [How Extensions Work](./HOW_EXTENSIONS_WORK.md)
- [Extension Architecture](./EXTENSION_ARCHITECTURE.md)
- [Auto-Loading Extensions](./AUTO_LOADING_EXTENSIONS.md)
- [Agency Collaboration Examples](./AGENCY_COLLABORATION_EXAMPLE.md)
- [Self-Hosted Registries](./SELF_HOSTED_REGISTRIES.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Releasing & Publishing](./RELEASING.md)
- [Contributing](./CONTRIBUTING.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

- [Submit New Extension](https://github.com/framersai/agentos-extensions/issues/new?template=new-extension.yml)
- [Report Bug](https://github.com/framersai/agentos-extensions/issues/new?template=bug-report.yml)
- [Request Feature](https://github.com/framersai/agentos-extensions/discussions)

## Links

- **Website**: [frame.dev](https://frame.dev)
- **AgentOS**: [agentos.sh](https://agentos.sh)
- **Marketplace**: [vca.chat](https://vca.chat)
- **npm**: [@framers](https://www.npmjs.com/org/framers)
- **API Docs**: [framersai.github.io/agentos-extensions](https://framersai.github.io/agentos-extensions/)
- **Contact**: team@frame.dev

## License

All extensions in this repository are MIT licensed.

<p align="center">
  <a href="https://agentos.sh"><img src="logos/agentos-primary-transparent-2x.png" alt="AgentOS" height="48" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://frame.dev" target="_blank" rel="noopener"><img src="logos/frame-logo-green-transparent-4x.png" alt="Frame.dev" height="48" /></a>
</p>

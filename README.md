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

## 📂 Repository Structure

```
agentos-extensions/
├── 📁 templates/          # Starter templates for new extensions
│   ├── basic-tool/        # Single tool template
│   ├── multi-tool/        # Multiple tools template
│   ├── guardrail/         # Safety/compliance template
│   └── workflow/          # Multi-step process template
│
└── 📁 registry/           # Official AgentOS Extension Registry
    ├── 📁 curated/        # Official & verified extensions
    │   ├── core/          # Essential AgentOS tools
    │   ├── research/      # Research & analysis tools
    │   ├── integrations/  # External service connectors
    │   ├── productivity/  # Enterprise productivity
    │   ├── ai-models/     # AI provider integrations
    │   └── enterprise/    # Enterprise features
    │
    └── 📁 community/      # Community-contributed extensions
        ├── research/      # Research tools
        ├── productivity/  # Productivity tools
        ├── development/   # Developer tools
        ├── integrations/  # Service integrations
        └── utilities/     # General utilities
```

## 🎯 Extension Types

### Templates
Starting points for building new extensions. [Browse templates →](./templates)

### Curated Extensions
Professional extensions maintained by Frame.dev and verified partners.
- 🛡️ Security audited
- 📊 Performance optimized
- 📚 Comprehensive documentation
- 🎯 SLA support available

[Browse curated extensions →](./curated)

### Community Extensions
Open-source extensions built by the community.
- 🌟 Community reviewed
- 🆓 Free to use
- 🚀 Free CI/CD provided
- 🤝 Community supported

[Browse community extensions →](./community)

## 🚀 Quick Start

### Using an Extension

```bash
# Curated extension
npm install @framers/agentos-research-web-search

# Community extension
npm install @framers/agentos-productivity-task-manager
```

```typescript
import { AgentOS } from '@framers/agentos';
import webSearch from '@framers/agentos-research-web-search';

const agentos = new AgentOS();
await agentos.initialize({
  extensionManifest: {
    packs: [{
      factory: () => webSearch({ /* config */ })
    }]
  }
});
```

### Creating an Extension

1. **Choose a template**:
```bash
cp -r templates/basic-tool community/category/my-extension
```

2. **Develop your extension**:
```bash
cd community/category/my-extension
npm install
npm run dev
```

3. **Submit for review**:
```bash
npm test
npm run build
# Create PR to this repository
```

## 📦 Naming Convention

### Templates
`@framers/agentos-template-{type}`
- Example: `@framers/agentos-template-basic-tool`

### Curated Extensions
`@framers/agentos-{category}-{name}`
- Example: `@framers/agentos-research-web-search`
- Example: `@framers/agentos-core-utilities`

### Community Extensions
`@framers/agentos-{category}-{name}`
- Example: `@framers/agentos-productivity-pomodoro`
- Example: `@framers/agentos-development-snippet-manager`

## 🎯 Free CI/CD for Contributors

We provide **FREE GitHub Actions CI/CD** for all extensions:
- ✅ Automated testing (Node 18 & 20)
- ✅ Code coverage reporting
- ✅ npm publishing on version bump
- ✅ GitHub releases
- ✅ Documentation generation
- ✅ Security scanning
- ✅ Dependency updates

## 🏆 Featured Extensions

### Curated
| Extension | Category | Description | Weekly Downloads |
|-----------|----------|-------------|------------------|
| [web-search](./registry/curated/research/web-search) | Research | Multi-provider web search | ![npm](https://img.shields.io/npm/dw/@framers/agentos-research-web-search) |
| [telegram](./registry/curated/integrations/telegram) | Integration | Telegram Bot API | ![npm](https://img.shields.io/npm/dw/@framers/agentos-integrations-telegram) |

### Community
| Extension | Category | Description | Weekly Downloads |
|-----------|----------|-------------|------------------|
| - | - | Be the first! | - |

## 📋 Quality Standards

### All Extensions Must Have:
- ✅ TypeScript with strict mode
- ✅ >80% test coverage
- ✅ Comprehensive documentation
- ✅ MIT license
- ✅ Security review passed
- ✅ No hardcoded secrets

### Additional for Curated:
- ✅ Professional code review
- ✅ Performance benchmarks
- ✅ Integration tests
- ✅ Migration guides
- ✅ SLA commitment

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

### Quick Links
- [Submit New Extension](https://github.com/framersai/agentos-extensions/issues/new?template=new-extension.yml)
- [Report Bug](https://github.com/framersai/agentos-extensions/issues/new?template=bug-report.yml)
- [Request Feature](https://github.com/framersai/agentos-extensions/discussions)
- [Join Discord](https://discord.gg/agentos)

## 📖 Documentation

- [Extension Development Guide](./docs/DEVELOPMENT.md)
- [How Extensions Work](./HOW_EXTENSIONS_WORK.md)
- [Extension Architecture](./EXTENSION_ARCHITECTURE.md)
- [Auto-Loading Extensions](./AUTO_LOADING_EXTENSIONS.md)
- [Agency Collaboration Examples](./AGENCY_COLLABORATION_EXAMPLE.md)
- [API Reference](./docs/API.md)
- [Migration Guide](./MIGRATION_GUIDE.md)

## 🏢 Partner Program

Interested in becoming a verified extension partner?
- Professional code review
- Security audit assistance
- Co-marketing opportunities
- Revenue sharing for paid extensions

Contact: partners@frame.dev

## 📊 Stats

- **Total Extensions**: 2 (Web Search, Telegram)
- **Total Tools**: 9 (3 search + 6 telegram)
- **Weekly Downloads**: ![npm](https://img.shields.io/npm/dw/@framers/agentos-research-web-search) + ![npm](https://img.shields.io/npm/dw/@framers/agentos-integrations-telegram)
- **Contributors**: ![GitHub contributors](https://img.shields.io/github/contributors/framersai/agentos-extensions)
- **Stars**: ![GitHub stars](https://img.shields.io/github/stars/framersai/agentos-extensions)

## 📝 License

All extensions in this repository are MIT licensed.

## 🔗 Links

- **NPM Organization**: [@framers](https://www.npmjs.com/org/framers)
- **AgentOS Core**: [github.com/framersai/voice-chat-assistant](https://github.com/framersai/voice-chat-assistant)
- **Documentation**: [agentos.sh](https://agentos.sh)
- **Support**: support@frame.dev

---

Built with ❤️ by Frame.dev and the AgentOS community
## Links
- Website: https://frame.dev
- AgentOS: https://agentos.sh
- Marketplace: https://vca.chat
- GitHub: https://github.com/framersai/agentos-extensions
- npm: https://www.npmjs.com/package/@framers/agentos-extensions
## Contributing & Security
- Contributing: ./\.github/CONTRIBUTING.md
- Code of Conduct: ./\.github/CODE_OF_CONDUCT.md
- Security Policy: ./\.github/SECURITY.md

<p align="center">
  <a href="https://agentos.sh"><img src="logos/agentos-primary-transparent-2x.png" alt="AgentOS" height="48" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://frame.dev" target="_blank" rel="noopener"><img src="logos/frame-logo-green-transparent-4x.png" alt="Frame.dev" height="48" /></a>
</p>

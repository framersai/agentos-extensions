# Contributing to AgentOS Extensions

Thank you for your interest in contributing to the AgentOS Extensions ecosystem!

## 🎯 Free CI/CD for Contributors

**We provide FREE GitHub Actions CI/CD for all community extensions!** You don't need to worry about:
- Setting up test runners
- Configuring npm publishing
- Managing GitHub releases
- Running coverage reports
- Dependency updates

We handle all the infrastructure - you focus on building great extensions!

## Getting Started

1. **Fork the repository**: https://github.com/framersai/agentos-extensions
2. **Clone your fork**:
   ```bash
   git clone https://github.com/yourusername/agentos-extensions
   cd agentos-extensions
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feat/my-extension
   ```

## Development Process

### Creating a New Extension

1. **Copy the template**:
   ```bash
   cp -r packages/ext-template packages/ext-myextension
   ```

2. **Configure your extension**:
   - Update `package.json` with your extension details
   - Modify `manifest.json` with proper metadata
   - Implement tools in `src/tools/`

3. **Follow the standards**:
   - Read [RFC_EXTENSION_STANDARDS.md](../packages/agentos/docs/RFC_EXTENSION_STANDARDS.md)
   - Use TypeScript with strict mode
   - Implement the ITool interface correctly
   - Include comprehensive tests

### Code Quality

- **Linting**: Run `npm run lint` and fix all issues
- **Type checking**: Ensure `npm run build` succeeds
- **Testing**: Maintain >80% code coverage
- **Documentation**: Update README with clear examples

### Commit Messages

Follow conventional commits format:

```
feat: add weather tool to search extension
fix: handle missing api key gracefully  
docs: update configuration examples
test: add integration tests for search tool
chore: update dependencies
```

## Pull Request Process

1. **Ensure all tests pass**:
   ```bash
   npm test
   npm run lint
   npm run build
   ```

2. **Update documentation**:
   - Add/update README in your extension folder
   - Update registry.json with your extension
   - Add examples in `examples/` folder

3. **Create pull request**:
   - Title: `feat: add [extension-name] extension`
   - Description should include:
     - What the extension does
     - Configuration required
     - Example usage
     - Test results

4. **Automated checks**:
   When you submit a PR, our CI will automatically:
   - ✅ Validate extension structure
   - ✅ Run linting
   - ✅ Execute tests on Node 18 & 20
   - ✅ Check test coverage
   - ✅ Build the extension
   - ✅ Generate documentation
   - ✅ Security scanning

5. **Code review checklist**:
   - [ ] Follows naming conventions
   - [ ] Implements ITool interface correctly
   - [ ] Includes unit tests (>80% coverage)
   - [ ] Has integration tests
   - [ ] Documentation is complete
   - [ ] No security vulnerabilities
   - [ ] MIT licensed
   - [ ] Uses semantic versioning

## After Your PR is Merged

Once merged to `master`, our automation will:

1. **Run full CI suite** on all extensions
2. **Auto-publish to npm** when version is bumped
3. **Create GitHub release** with changelog
4. **Update extension registry**
5. **Deploy documentation**

### Version Bumping

To release a new version:

```bash
cd packages/ext-myextension
npm version patch  # or minor/major
git add .
git commit -m "chore(ext-myextension): bump version to x.y.z"
git push
```

The CI/CD will automatically:
- Publish to npm as `@framers/agentos-ext-myextension`
- Create a GitHub release
- Update the registry

## Extension Guidelines

### Security

- Never hardcode API keys or secrets
- Use environment variables for sensitive data
- Validate all inputs
- Handle errors gracefully
- Document required permissions

### Performance

- Keep bundle size minimal
- Use async/await properly
- Implement timeouts for external calls
- Cache results when appropriate

### Compatibility

- Test with latest AgentOS version
- Specify minimum AgentOS version in manifest
- Handle missing configuration gracefully
- Provide sensible defaults

## Testing Your Extension Locally

### Unit Tests

```bash
cd packages/ext-myextension
npm test
```

### Integration with AgentOS

```typescript
// test-integration.ts
import { AgentOS } from '@agentos/core';
import myExtension from './src/index';

const agentos = new AgentOS();
await agentos.initialize({
  extensionManifest: {
    packs: [{
      factory: () => myExtension({ /* options */ })
    }]
  }
});

// Test your tools
const tool = agentos.toolExecutor.getTool('myTool');
const result = await tool.execute({ /* input */ });
```

## Community

- **Discord**: Join our Discord for discussions
- **Issues**: Report bugs or request features on GitHub
- **Discussions**: Use GitHub Discussions for questions

## Getting Help

If you need help:
1. Check existing issues and discussions
2. Read the [RFC_EXTENSION_STANDARDS.md](../packages/agentos/docs/RFC_EXTENSION_STANDARDS.md)
3. Ask in Discord or open a discussion
4. Tag your PR with `help-wanted` if stuck

## Recognition

Contributors will be:
- Listed in the extension's README
- Mentioned in release notes
- Given credit in the main AgentOS documentation
- Invited to become maintainers for exceptional contributions

## Infrastructure We Provide

As a contributor, you get access to:

### Free CI/CD
- GitHub Actions for testing
- Automated npm publishing
- GitHub release creation
- Codecov integration

### Development Tools
- ESLint configuration
- TypeScript setup
- Vitest for testing
- TypeDoc for documentation

### Support
- Code reviews from core team
- Help with implementation
- Architecture guidance
- Marketing support for your extension

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

If you have questions about contributing, please:
1. Check existing issues and discussions
2. Read the documentation
3. Ask in Discord: https://discord.gg/agentos
4. Email: extensions@frame.dev

Thank you for helping make AgentOS better! 🚀

---

**Remember: We handle the infrastructure, you focus on the innovation!**
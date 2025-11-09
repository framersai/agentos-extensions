# Automatic Extension Loading in AgentOS

AgentOS now automatically discovers and loads extensions from the registry, making tools immediately available to all agents.

## How It Works

### 1. Default Configuration

By default, AgentOS:
- ✅ **Loads curated extensions** automatically
- ⛔ **Community extensions** are opt-in (for security)
- ✅ **Auto-installs** missing extensions from npm
- ✅ **Caches** loaded extensions for performance

```typescript
// Default configuration in AgentOS
const DEFAULT_EXTENSION_CONFIG = {
  loadCurated: true,      // Load official extensions
  loadCommunity: false,   // Don't load community by default
  autoInstall: true,      // Auto-install from npm
  npmRegistry: 'https://registry.npmjs.org',
  extensionScope: '@framers'
};
```

### 2. Initialization Flow

```typescript
// When AgentOS initializes
const agentos = new AgentOS({
  enableExtensions: true,  // Enabled by default
  extensionConfig: {
    loadCurated: true,
    loadCommunity: true,  // Opt-in to community
    whitelist: [],        // Load all
    blacklist: []         // Or exclude specific ones
  }
});

await agentos.initialize();
// Extensions are now loaded and available!
```

### 3. Extension Discovery

The system discovers extensions from:

1. **Local Registry** (`registry.json`)
   - Curated extensions metadata
   - Community extensions metadata
   - Version and compatibility info

2. **NPM Registry**
   - Searches for `@framers/agentos-*` packages
   - Auto-installs if missing locally
   - Checks for updates

3. **Loaded Packages**
   - Already installed in `node_modules`
   - Direct imports for development

## Dynamic Loading

### Client-Side Discovery

The AgentOS client can dynamically discover and display extensions:

```typescript
// Get all available extensions
const extensions = await agentosClient.getExtensions();

// Get all available tools
const tools = await agentosClient.getAvailableTools();

// Install a new extension
await agentosClient.installExtension('@framers/agentos-research-web-search');

// Execute a tool directly
const result = await agentosClient.executeTool('webSearch', {
  query: 'latest AI news'
});
```

### Extension UI

The client provides a full UI for:
- 📦 **Browsing** available extensions
- 🔍 **Searching** npm for new extensions
- ⬇️ **Installing** with one click
- 🧪 **Testing** tools with schema validation
- 📊 **Monitoring** tool execution

## Configuration Options

### Selective Loading

```typescript
// Load only specific extensions
new AgentOS({
  extensionConfig: {
    whitelist: [
      '@framers/agentos-research-web-search',
      '@framers/agentos-integrations-telegram'
    ]
  }
});

// Exclude specific extensions
new AgentOS({
  extensionConfig: {
    blacklist: ['@framers/agentos-experimental-tool']
  }
});
```

### Environment-Based Configuration

Extensions automatically read configuration from environment:

```bash
# Web Search Extension
SERPER_API_KEY=xxx
SERPAPI_API_KEY=xxx

# Telegram Extension
TELEGRAM_BOT_TOKEN=xxx

# Extension Loading
AGENTOS_LOAD_CURATED=true
AGENTOS_LOAD_COMMUNITY=false
AGENTOS_AUTO_INSTALL=true
```

## Agency Integration

### Automatic Tool Availability

When GMIs are created in an agency, they automatically have access to all loaded tools:

```typescript
// Create agency with automatic tool access
const agency = await agentos.createAgency({
  roles: [
    {
      id: 'researcher',
      personaId: 'research_specialist',
      // Tools are automatically available based on loaded extensions!
    },
    {
      id: 'communicator',
      personaId: 'communications_manager',
      // Can use any loaded tool
    }
  ]
});

// Execute workflow - tools are ready to use
const result = await agentos.executeAgencyWorkflow(
  agency.id,
  workflow,
  input
);
```

### Tool Discovery by Capability

GMIs can discover tools by capability:

```typescript
// Check what tools are available for a persona
const researcherTools = tools.filter(tool => 
  ['webSearch', 'factCheck'].includes(tool.id)
);

// Verify persona has required tools
const { satisfied, missing } = checkPersonaRequirements(
  'researcher',
  availableTools.map(t => t.id)
);
```

## Parallel Agency Demo

The new **Parallel Agency View** shows:
- 🤖 Multiple GMIs working simultaneously
- ⚡ Real-time task execution
- 📊 Live progress tracking
- 🔄 Task dependencies and coordination
- 💬 Agent thoughts and actions

### Demo Workflow

1. **Parallel Research**: Two research tasks run simultaneously
2. **Fact Checking**: Waits for research to complete
3. **Report Formatting**: Communications agent formats results
4. **Telegram Sending**: Final delivery to channel

## Extension Registry Structure

```
registry/
├── curated/                  # Official extensions
│   ├── research/
│   │   └── web-search/       # Web search tools
│   └── integrations/
│       └── telegram/         # Telegram bot tools
│
└── community/                # Community contributions
    ├── research/
    ├── productivity/
    ├── development/
    ├── integrations/
    └── utilities/
```

## Security Considerations

### Curated vs Community

- **Curated**: Verified, audited, auto-loaded
- **Community**: Require explicit opt-in

### Sandboxing

Extensions run in the same process but with:
- Permission checks via capabilities
- Rate limiting
- Resource monitoring
- Audit logging

### API Key Management

- Never hardcoded in extensions
- Read from environment variables
- Support multiple configuration methods
- Secure storage in production

## Performance

### Caching

- Extensions cached after first load
- Tools indexed for fast lookup
- Metadata stored in registry.json

### Lazy Loading

- Extensions loaded on-demand
- Tools initialized when first used
- Resources cleaned up on deactivation

## Troubleshooting

### Extension Not Loading

1. Check if package is installed: `npm list @framers/agentos-*`
2. Verify in whitelist/not in blacklist
3. Check environment variables for API keys
4. Look at console logs during initialization

### Tool Not Available

1. Verify extension is loaded
2. Check tool ID matches exactly
3. Ensure GMI has required capabilities
4. Verify tool registration in extension

### Performance Issues

1. Limit number of loaded extensions
2. Use whitelist for specific extensions
3. Disable auto-install in production
4. Monitor extension initialization time

## Development

### Creating New Extensions

```bash
# Use the template
cp -r templates/basic-tool community/category/my-extension

# Update package.json
npm init

# Implement tools
# Test locally
npm test

# Publish to npm
npm publish
```

### Testing Extensions

```typescript
// Test in isolation
const tool = new MyTool(service);
const result = await tool.execute(input, context);

// Test in AgentOS
const agentos = new AgentOS();
await agentos.loadExtension('./my-extension');
const tools = agentos.getAvailableTools();
```

## Summary

The automatic extension loading system provides:
- 🚀 **Zero-config startup** - Extensions load automatically
- 🔌 **Plug-and-play tools** - Immediately available to agents
- 📦 **NPM integration** - Install from registry
- 🎯 **Smart defaults** - Curated extensions by default
- 🔒 **Security first** - Community extensions require opt-in
- ⚡ **Performance** - Caching and lazy loading
- 🎨 **Rich UI** - Browse, install, and test extensions
- 🤝 **Agency ready** - Tools available to all GMIs

This makes AgentOS truly extensible while maintaining security and performance!

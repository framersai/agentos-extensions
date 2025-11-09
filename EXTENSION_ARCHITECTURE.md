# AgentOS Extension Architecture

## Core Concepts

### Extensions vs Tools

The AgentOS extension system has a clear hierarchy:

```
Extension (Package/Container)
├── Tools (implement ITool interface)
├── Guardrails (implement IGuardrailService)
├── Workflows (workflow definitions)
└── Response Processors (output transformers)
```

### Key Differences

| Aspect | Extension | Tool |
|--------|-----------|------|
| **What it is** | A package/module that provides capabilities | A specific capability that implements `ITool` |
| **Scope** | Can contain multiple tools, guardrails, etc. | Single focused functionality |
| **Registration** | Loaded via ExtensionManager | Registered as part of an extension |
| **Example** | `@framers/agentos-integrations-telegram` | `telegramSendMessage` tool |

### Extension Anatomy

```typescript
// Extension Package Structure
extension-package/
├── src/
│   ├── index.ts           // Extension entry point
│   ├── tools/             // Tool implementations
│   │   ├── tool1.ts       // Implements ITool
│   │   └── tool2.ts       // Implements ITool
│   ├── services/          // Shared services
│   └── types.ts           // Type definitions
├── manifest.json          // Extension metadata
└── package.json          // NPM package info

// Extension Entry Point
export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  return {
    name: '@framers/my-extension',
    version: '1.0.0',
    descriptors: [
      {
        id: 'tool1',
        kind: 'tool',        // Extension kind
        payload: new Tool1() // ITool implementation
      },
      {
        id: 'tool2',
        kind: 'tool',
        payload: new Tool2()
      }
    ],
    onActivate: async () => { /* initialization */ },
    onDeactivate: async () => { /* cleanup */ }
  };
}
```

## The ITool Interface

Tools must implement the `ITool` interface:

```typescript
export interface ITool<TInput = any, TOutput = any> {
  // Identification
  readonly id: string;                // Unique tool ID
  readonly name: string;              // LLM-facing name
  readonly displayName: string;       // Human-readable name
  readonly description: string;       // Detailed description for LLM
  
  // Schema definitions
  readonly inputSchema: JSONSchema;   // Expected input structure
  readonly outputSchema?: JSONSchema; // Output structure
  
  // Metadata
  readonly category?: string;          // Tool category
  readonly version?: string;           // Tool version
  readonly hasSideEffects?: boolean;  // Has external effects
  readonly requiredCapabilities?: string[]; // Required permissions
  
  // Core functionality
  execute(args: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult<TOutput>>;
  
  // Optional methods
  validateArgs?(args: any): { isValid: boolean; errors?: string[] };
  shutdown?(): Promise<void>;
}
```

## Extension Loading Process

1. **Discovery**: Extensions are discovered from the manifest
2. **Factory Execution**: Extension factory functions are called
3. **Registration**: Extension descriptors are registered with ExtensionRegistry
4. **Activation**: `onActivate` lifecycle hooks are called
5. **Availability**: Tools become available to GMIs

```typescript
// 1. Define manifest
const manifest = {
  packs: [
    {
      factory: () => createWebSearchExtension(config),
      priority: 10
    },
    {
      factory: () => createTelegramExtension(config),
      priority: 20
    }
  ]
};

// 2. Load extensions
await extensionManager.loadFromManifest(manifest);

// 3. Tools are now available
const tools = registry.getDescriptorStack('tool');
```

## Extension Registry

The registry manages all loaded extensions:

```typescript
// Get all tools
const tools = registry.getDescriptorStack('tool');

// Get specific tool
const webSearch = tools.find(t => t.id === 'webSearch');

// Priority stacking
// Higher priority extensions can override lower priority ones
const stack = registry.getDescriptorStack('tool');
// stack[0] = highest priority tool with id 'X'
// stack[1] = lower priority tool with same id 'X'
```

## Environment Variable Support

Extensions can read configuration from multiple sources:

```typescript
// Priority order for configuration:
// 1. Direct options
// 2. Custom environment variables
// 3. Default environment variables
// 4. Fallback values

function resolveBotToken(options: TelegramExtensionOptions): string {
  // 1. Direct option
  if (options.botToken) return options.botToken;
  
  // 2. Custom env var
  const customEnv = options.botTokenEnv || 'TELEGRAM_BOT_TOKEN';
  if (process.env[customEnv]) return process.env[customEnv];
  
  // 3. Common variations
  const variations = ['TELEGRAM_TOKEN', 'BOT_TOKEN'];
  for (const env of variations) {
    if (process.env[env]) return process.env[env];
  }
  
  // 4. Error if not found
  throw new Error('Bot token not found');
}
```

## Agency Integration

Extensions enable GMIs to collaborate:

```typescript
// GMIs have different roles and capabilities
const researcherGMI = await gmiManager.createGMI({
  personaId: 'researcher',
  capabilities: ['webSearch', 'factCheck']
});

const communicatorGMI = await gmiManager.createGMI({
  personaId: 'communicator',
  capabilities: ['telegramSendMessage']
});

// Agency coordinates GMIs
const agency = await agencyRegistry.createAgency({
  workflowId: 'research-and-report',
  seats: {
    researcher: researcherGMI,
    communicator: communicatorGMI
  }
});
```

## Tool Execution Context

Tools receive context about the calling GMI:

```typescript
export interface ToolExecutionContext {
  gmiId: string;           // Which GMI is calling
  personaId: string;        // Active persona
  userContext: UserContext; // User information
  correlationId?: string;   // Request tracking
  sessionData?: any;        // Session state
}
```

## Extension Lifecycle

### Activation
```typescript
onActivate: async (context) => {
  // Initialize connections
  await service.connect();
  // Set up listeners
  service.on('event', handler);
  // Load resources
  await loadConfiguration();
}
```

### Deactivation
```typescript
onDeactivate: async (context) => {
  // Clean up connections
  await service.disconnect();
  // Remove listeners
  service.removeAllListeners();
  // Release resources
  await cleanup();
}
```

## Best Practices

### 1. Single Responsibility
Each tool should do one thing well:
```typescript
// Good: Focused tools
class SendMessageTool { /* sends messages */ }
class SendPhotoTool { /* sends photos */ }

// Bad: Kitchen sink tool
class TelegramTool { /* does everything */ }
```

### 2. Proper Schema Definition
Define clear input/output schemas:
```typescript
inputSchema: {
  type: 'object',
  required: ['chatId', 'text'],
  properties: {
    chatId: {
      type: ['string', 'number'],
      description: 'Target chat identifier'
    },
    text: {
      type: 'string',
      description: 'Message text',
      maxLength: 4096
    }
  }
}
```

### 3. Error Handling
Return errors in ToolExecutionResult:
```typescript
async execute(args, context): Promise<ToolExecutionResult> {
  try {
    const result = await operation(args);
    return { success: true, output: result };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: { code: error.code }
    };
  }
}
```

### 4. Resource Management
Clean up in shutdown:
```typescript
async shutdown(): Promise<void> {
  await this.connection?.close();
  this.cache?.clear();
  this.timers?.forEach(t => clearInterval(t));
}
```

### 5. Configuration Flexibility
Support multiple configuration methods:
```typescript
// Environment variables
process.env.MY_API_KEY

// Direct configuration
{ apiKey: 'key' }

// Configuration files
config.json, .env

// Defaults with overrides
{ ...defaults, ...userConfig }
```

## Extension Categories

### Tool Extensions
Provide executable capabilities:
- Web search
- API calls
- File operations
- Message sending

### Guardrail Extensions
Provide safety checks:
- Content filtering
- Rate limiting
- Permission checking
- Output validation

### Workflow Extensions
Define multi-step processes:
- Research workflows
- Deployment pipelines
- Data processing flows

### Response Processor Extensions
Transform outputs:
- Format conversion
- Language translation
- Summary generation
- Data enrichment

## Summary

The extension architecture provides:
- **Modularity**: Extensions as self-contained packages
- **Flexibility**: Multiple configuration sources
- **Scalability**: Priority-based stacking
- **Collaboration**: GMIs share tools through extensions
- **Lifecycle**: Proper initialization and cleanup
- **Type Safety**: Strong typing with TypeScript
- **Discovery**: Registry for tool discovery
- **Standards**: Consistent ITool interface

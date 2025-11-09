# Web Search Extension for AgentOS

Enable powerful web search capabilities for your AgentOS agents.

## Features

- 🔍 **Web Search** - Search the web with multiple providers
- 📚 **Research Aggregator** - Compile research from multiple searches
- ✅ **Fact Checker** - Verify claims across sources
- 🌍 **Multi-provider Support** - Serper, SerpAPI, Brave, DuckDuckGo

## Installation

```bash
npm install @framers/agentos-ext-search
```

## Quick Start

```typescript
import { AgentOS } from '@agentos/core';
import searchExtension from '@framers/agentos-ext-search';

const agentos = new AgentOS();

await agentos.initialize({
  // ... other config
  extensionManifest: {
    packs: [
      {
        factory: () => searchExtension({
          manifestEntry: {} as any,
          source: { sourceName: '@framers/agentos-ext-search' },
          options: {
            search: {
              provider: 'serper',
              apiKey: process.env.SERPER_API_KEY
            }
          }
        })
      }
    ]
  }
});
```

## Configuration

### Environment Variables

```bash
# Option 1: Serper (2,500 free queries)
SERPER_API_KEY=your_serper_api_key

# Option 2: SerpAPI (100 free/month)
SERPAPI_API_KEY=your_serpapi_key

# Option 3: Brave (2,000 free/month)
BRAVE_SEARCH_API_KEY=your_brave_api_key

# Optional: Override provider
SEARCH_PROVIDER=serper  # or serpapi, brave, duckduckgo
```

### Programmatic Configuration

```typescript
{
  search: {
    provider: 'serper',  // 'serper' | 'serpapi' | 'brave' | 'duckduckgo'
    apiKey: 'your-api-key',
    rateLimit: 5  // requests per second
  }
}
```

## Available Tools

### 1. Web Search

Search the web for information.

**Input:**
```typescript
{
  query: string;           // Search query
  numResults?: number;     // Results to return (1-10, default: 5)
  searchType?: string;     // 'web' | 'news' | 'images' | 'videos'
  timeRange?: string;      // 'any' | 'day' | 'week' | 'month' | 'year'
  region?: string;         // Country code: 'us', 'uk', 'fr', etc.
}
```

**Example:**
```typescript
const result = await tool.execute({
  query: "latest AI developments",
  numResults: 5,
  timeRange: "week"
});
```

### 2. Research Aggregator

Perform comprehensive research on a topic.

**Input:**
```typescript
{
  topic: string;                // Research topic
  searchQueries?: string[];     // Specific queries to run
  sources?: string[];           // 'web' | 'academic' | 'news'
  maxResultsPerQuery?: number;  // Results per query (default: 3)
}
```

### 3. Fact Checker

Verify claims across multiple sources.

**Input:**
```typescript
{
  claim: string;         // Claim to verify
  context?: string;      // Additional context
  sources?: string[];    // Specific sources to check
}
```

## Provider Setup

### Serper.dev (Recommended)
1. Sign up: https://serper.dev/signup
2. Get API key from dashboard
3. 2,500 free queries

### SerpAPI
1. Sign up: https://serpapi.com/users/sign_up
2. Copy API key from account page
3. 100 free searches/month

### Brave Search
1. Register: https://brave.com/search/api/
2. Get API key
3. 2,000 free queries/month

### DuckDuckGo (Fallback)
- No API key required
- Limited functionality
- Rate limited

## Usage with Agents

Once installed, agents can use search tools:

```typescript
// Agent conversation
User: "Search for information about quantum computing"
Agent: [Uses webSearch tool] Here's what I found about quantum computing...

User: "Research the latest renewable energy developments"
Agent: [Uses researchAggregator tool] I've compiled research from multiple sources...

User: "Fact check: Is coffee the second most traded commodity?"
Agent: [Uses factCheck tool] After checking multiple sources...
```

## Error Handling

The extension handles various error scenarios:

```typescript
// Missing API key
{
  success: false,
  error: "Search provider not configured",
  details: {
    message: "Please configure a search API key",
    providers: [/* signup links */]
  }
}

// Rate limiting
// Automatically enforced based on provider limits

// Network errors
{
  success: false,
  error: "Search failed: Network error",
  details: { provider: "serper", timestamp: "..." }
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## License

MIT © Frame.dev

## Support

- Issues: https://github.com/framersai/agentos-extensions/issues
- Documentation: https://agentos.sh/docs/extensions
- Discord: https://discord.gg/agentos

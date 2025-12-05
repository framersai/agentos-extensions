# Web Browser Extension for AgentOS

Browser automation capabilities for AgentOS agents - navigate pages, scrape content, click elements, and capture screenshots.

## Features

- **Navigate**: Go to any URL and get page content
- **Scrape**: Extract content using CSS selectors
- **Click**: Interact with page elements
- **Type**: Fill in forms and input fields
- **Screenshot**: Capture visual snapshots
- **Page Snapshot**: Get accessibility tree for intelligent interaction

## Installation

```bash
npm install @framers/agentos-research-web-browser
```

## Quick Start

```typescript
import { createExtensionPack } from '@framers/agentos-research-web-browser';
import { ExtensionManager } from '@framers/agentos';

const extensionManager = new ExtensionManager();

// Register the browser extension
extensionManager.register(createExtensionPack({
  options: {
    headless: true,
    timeout: 30000,
    viewport: { width: 1920, height: 1080 }
  },
  logger: console
}));
```

## Tools

### browserNavigate

Navigate to a URL and retrieve page content.

```typescript
const result = await gmi.executeTool('browserNavigate', {
  url: 'https://example.com',
  waitFor: 'networkidle2',
  returnText: true
});
// Returns: { url, status, title, text, loadTime }
```

### browserScrape

Extract content using CSS selectors.

```typescript
const result = await gmi.executeTool('browserScrape', {
  selector: 'article h2',
  limit: 10
});
// Returns: { selector, count, elements: [{ tag, text, html, attributes }] }
```

### browserClick

Click on an element.

```typescript
const result = await gmi.executeTool('browserClick', {
  selector: 'button.submit',
  waitForNavigation: true
});
// Returns: { success, element, newUrl }
```

### browserType

Type text into an input field.

```typescript
const result = await gmi.executeTool('browserType', {
  selector: 'input[name="search"]',
  text: 'AgentOS documentation',
  clear: true
});
// Returns: { success, element, text }
```

### browserScreenshot

Capture a screenshot.

```typescript
const result = await gmi.executeTool('browserScreenshot', {
  fullPage: true,
  format: 'png'
});
// Returns: { data (base64), format, width, height, size }
```

### browserSnapshot

Get accessibility tree for intelligent interaction.

```typescript
const result = await gmi.executeTool('browserSnapshot', {});
// Returns: { url, title, elements, links, forms, interactable }
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headless` | boolean | `true` | Run browser in headless mode |
| `timeout` | number | `30000` | Default timeout (ms) |
| `userAgent` | string | - | Custom user agent |
| `viewport.width` | number | `1920` | Viewport width |
| `viewport.height` | number | `1080` | Viewport height |
| `executablePath` | string | auto | Path to Chrome executable |

## Use Cases

### Web Research Agent

```typescript
// Search and scrape information
await gmi.executeTool('browserNavigate', { url: 'https://google.com' });
await gmi.executeTool('browserType', { selector: 'input[name="q"]', text: 'AI agents 2024' });
await gmi.executeTool('browserClick', { selector: 'input[type="submit"]', waitForNavigation: true });
const results = await gmi.executeTool('browserScrape', { selector: '.g h3' });
```

### Form Automation

```typescript
await gmi.executeTool('browserNavigate', { url: 'https://signup.example.com' });
await gmi.executeTool('browserType', { selector: '#email', text: 'user@example.com' });
await gmi.executeTool('browserType', { selector: '#password', text: 'securepass123' });
await gmi.executeTool('browserClick', { selector: 'button[type="submit"]' });
```

### Visual Verification

```typescript
await gmi.executeTool('browserNavigate', { url: 'https://myapp.com' });
const screenshot = await gmi.executeTool('browserScreenshot', { fullPage: true });
// Send screenshot to vision model for analysis
```

## Dependencies

This extension requires Chrome/Chromium to be installed on the system. It uses `puppeteer-core` which does not bundle a browser.

## License

MIT © Frame.dev


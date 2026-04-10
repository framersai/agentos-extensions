// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExtensionManager } from '@framers/agentos';
import type { ExtensionPack, ExtensionPackContext } from '@framers/agentos';
import { createExtensionPack as createWebSearchPack } from '../../registry/curated/research/web-search/src/index';

/**
 * Minimal ToolExecutionContext for testing purposes.
 */
const TEST_TOOL_CONTEXT = {
  gmiId: 'test-gmi',
  personaId: 'test-persona',
  userContext: { userId: 'test-user' },
  correlationId: 'test-correlation',
};

/**
 * Helper: build a web-search ExtensionPack from a plain options object.
 */
function buildWebSearchPack(opts: Record<string, unknown> = {}): ExtensionPack {
  const ctx: ExtensionPackContext = { options: opts };
  return createWebSearchPack(ctx);
}

describe('E2E: Extension Lifecycle', () => {
  let manager: ExtensionManager;

  beforeEach(async () => {
    // Initialize extension system with an empty manifest — packs are loaded
    // explicitly per-test via loadManifest() or loadPackFromFactory().
    manager = new ExtensionManager();
  });

  afterEach(async () => {
    // Clean up all loaded packs and registries.
    await manager.shutdown();
  });

  describe('Extension Loading', () => {
    it('should load extension from manifest', async () => {
      const mgr = new ExtensionManager({
        manifest: {
          packs: [
            {
              factory: () => buildWebSearchPack(),
              identifier: 'web-search-test',
            },
          ],
        },
      });

      await mgr.loadManifest();

      const toolRegistry = mgr.getRegistry('tool');
      const tools = toolRegistry.listActive();
      expect(tools.length).toBeGreaterThan(0);

      await mgr.shutdown();
    });

    it('should register multiple tools from single extension', async () => {
      const mgr = new ExtensionManager({
        manifest: {
          packs: [
            {
              factory: () => buildWebSearchPack(),
              identifier: 'web-search-multi',
            },
          ],
        },
      });

      await mgr.loadManifest();

      const toolRegistry = mgr.getRegistry('tool');
      const tools = toolRegistry.listActive();
      const webSearchTools = tools.filter((t) =>
        ['web_search', 'research_aggregate', 'fact_check'].includes(t.id),
      );

      expect(webSearchTools).toHaveLength(3);

      await mgr.shutdown();
    });
  });

  describe('Tool Execution', () => {
    it('should execute registered tools', async () => {
      const pack = buildWebSearchPack();
      await manager.loadPackFromFactory(pack, 'web-search-exec');

      const toolRegistry = manager.getRegistry('tool');
      const webSearchDescriptor = toolRegistry.getActive('web_search');

      expect(webSearchDescriptor).toBeDefined();

      if (webSearchDescriptor?.payload) {
        const tool = webSearchDescriptor.payload as any;
        const result = await tool.execute(
          { query: 'test query' },
          TEST_TOOL_CONTEXT,
        );

        expect(result.success).toBe(true);
        expect(result.output).toBeDefined();
      }
    });
  });

  describe('Extension Priority', () => {
    it('should respect extension priority in stack', async () => {
      const highPriorityPack = buildWebSearchPack({ priority: 100 });
      const lowPriorityPack = buildWebSearchPack({ priority: 10 });

      // Both packs register descriptors under the same ids (e.g. "web_search").
      // The registry stacks them by priority — the higher-priority entry wins.
      await manager.loadPackFromFactory(lowPriorityPack, 'ws-low');
      await manager.loadPackFromFactory(highPriorityPack, 'ws-high');

      const toolRegistry = manager.getRegistry('tool');
      const active = toolRegistry.getActive('web_search');

      expect(active).toBeDefined();
      // The high-priority descriptor (100) should be active over the low (10).
      expect(active!.resolvedPriority).toBe(100);
    });
  });

  describe('Extension Lifecycle Hooks', () => {
    it('should call onActivate when extension loads', async () => {
      let activateCalled = false;

      const basePack = buildWebSearchPack();
      const packWithHooks: ExtensionPack = {
        ...basePack,
        onActivate: async () => {
          activateCalled = true;
        },
      };

      await manager.loadPackFromFactory(packWithHooks, 'hooks-activate');

      expect(activateCalled).toBe(true);
    });

    it('should call onDeactivate when extension unloads', async () => {
      let deactivateCalled = false;

      const basePack = buildWebSearchPack();
      const packWithHooks: ExtensionPack = {
        ...basePack,
        onDeactivate: async () => {
          deactivateCalled = true;
        },
      };

      await manager.loadPackFromFactory(packWithHooks, 'hooks-deactivate');

      await manager.shutdown();

      expect(deactivateCalled).toBe(true);
    });
  });

  describe('Extension Configuration', () => {
    it('should pass configuration to extension', async () => {
      const config = {
        serperApiKey: 'test-key',
        defaultMaxResults: 5,
      };

      const pack = buildWebSearchPack(config);

      await manager.loadPackFromFactory(pack, 'ws-configured');

      const toolRegistry = manager.getRegistry('tool');
      const webSearchDescriptor = toolRegistry.getActive('web_search');

      // Tool should be registered and callable with configuration.
      const tool = webSearchDescriptor?.payload as any;
      const result = await tool.execute(
        { query: 'test' },
        TEST_TOOL_CONTEXT,
      );

      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle extension load failures gracefully', async () => {
      const brokenFactory = () => {
        throw new Error('Extension failed to load');
      };

      const mgr = new ExtensionManager({
        manifest: {
          packs: [
            { factory: brokenFactory, identifier: 'broken' },
            {
              factory: () => buildWebSearchPack(),
              identifier: 'ws-after-broken',
            },
          ],
        },
      });

      // loadManifest swallows per-pack errors and continues with the next.
      await mgr.loadManifest();

      const toolRegistry = mgr.getRegistry('tool');
      const tools = toolRegistry.listActive();
      // Should have loaded the working extension.
      expect(tools.length).toBeGreaterThan(0);

      await mgr.shutdown();
    });

    it('should handle tool execution failures gracefully', async () => {
      const pack = buildWebSearchPack();

      // Inject a broken tool descriptor into the pack before loading.
      pack.descriptors.push({
        id: 'broken-tool',
        kind: 'tool',
        payload: {
          id: 'broken-tool',
          name: 'broken_tool',
          description: 'A tool that always fails',
          inputSchema: { type: 'object', properties: {} },
          execute: async () => {
            throw new Error('Tool execution failed');
          },
        },
      });

      await manager.loadPackFromFactory(pack, 'ws-with-broken');

      const toolRegistry = manager.getRegistry('tool');
      const brokenDescriptor = toolRegistry.getActive('broken-tool');

      expect(brokenDescriptor).toBeDefined();

      try {
        const tool = brokenDescriptor!.payload as any;
        await tool.execute({}, TEST_TOOL_CONTEXT);
        // Should not reach here.
        expect.unreachable('Expected execute to throw');
      } catch (error: any) {
        expect(error.message).toBe('Tool execution failed');
      }
    });
  });
});

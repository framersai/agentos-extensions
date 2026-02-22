import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSearchTool } from '../src/tools/webSearch';
import { SearchProviderService } from '../src/services/searchProvider';

// Mock the search provider service
vi.mock('../src/services/searchProvider');

describe('WebSearchTool', () => {
  let tool: WebSearchTool;
  let mockSearchService: vi.Mocked<SearchProviderService>;

  const ctx: any = {
    gmiId: 'test-gmi',
    personaId: 'test-persona',
    userContext: { userId: 'test-user' },
  };

  beforeEach(() => {
    mockSearchService = new SearchProviderService({}) as any;
    tool = new WebSearchTool(mockSearchService);
    vi.clearAllMocks();
  });
  
  describe('constructor', () => {
    it('should initialize with correct metadata', () => {
      expect(tool.id).toBe('web-search-v1');
      expect(tool.name).toBe('web_search');
      expect(tool.displayName).toBe('Web Search');
      expect(tool.description).toContain('Search the web');
    });
  });
  
  describe('execute', () => {
    it('should call search service with correct parameters', async () => {
      const mockResults = {
        provider: 'serper',
        results: [
          { title: 'Test', url: 'https://example.com', snippet: 'Test snippet' }
        ],
        metadata: { query: 'test query', timestamp: new Date().toISOString() }
      };
      
      mockSearchService.search = vi.fn().mockResolvedValue(mockResults);
      
      const input = {
        query: 'test query',
        maxResults: 5,
        provider: 'serper' as const
      };
      
      const result = await tool.execute(input, ctx);
      
      expect(mockSearchService.search).toHaveBeenCalledWith('test query', {
        maxResults: 5,
        provider: 'serper'
      });
      expect(result.success).toBe(true);
      expect(result.output).toEqual(mockResults);
    });
    
    it('should handle errors gracefully', async () => {
      const error = new Error('API error');
      mockSearchService.search = vi.fn().mockRejectedValue(error);
      
      const input = { query: 'test query' };
      const result = await tool.execute(input as any, ctx);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });
    
    it('should use default values when not provided', async () => {
      mockSearchService.search = vi.fn().mockResolvedValue({
        provider: 'duckduckgo',
        results: [],
        metadata: {}
      });
      
      const input = { query: 'test query' };
      await tool.execute(input as any, ctx);
      
      expect(mockSearchService.search).toHaveBeenCalledWith('test query', {
        maxResults: 10,
        provider: undefined
      });
    });
  });
  
  describe('validateArgs', () => {
    it('should validate required query parameter', () => {
      const result = tool.validateArgs({});
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Query is required');
    });
    
    it('should validate query is a string', () => {
      const result = tool.validateArgs({ query: 123 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Query must be a string');
    });
    
    it('should validate maxResults is a positive number', () => {
      const result = tool.validateArgs({ query: 'test', maxResults: -1 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('maxResults must be a positive number');
    });
    
    it('should validate provider is from allowed list', () => {
      const result = tool.validateArgs({ query: 'test', provider: 'invalid' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid provider');
    });
    
    it('should pass validation with correct inputs', () => {
      const result = tool.validateArgs({ 
        query: 'test query',
        maxResults: 5,
        provider: 'serper'
      });
      expect(result.isValid).toBe(true);
    });
  });
  
  describe('multiSearch', () => {
    it('should call multiSearch when multiSearch input is true', async () => {
      const mockMultiResults = {
        results: [{ title: 'Multi', url: 'https://example.com', snippet: 'Multi result', providers: ['serper', 'brave'], agreementCount: 2, confidenceScore: 80, providerPositions: { serper: 1, brave: 1 } }],
        metadata: { query: 'test', timestamp: new Date().toISOString(), totalResponseTime: 100, providersQueried: ['serper', 'brave'], providersSucceeded: ['serper', 'brave'], providersFailed: [], totalRawResults: 2, deduplicatedCount: 1 },
      };
      mockSearchService.multiSearch = vi.fn().mockResolvedValue(mockMultiResults);

      const result = await tool.execute({ query: 'test', multiSearch: true }, ctx);

      expect(mockSearchService.multiSearch).toHaveBeenCalledWith('test', { maxResults: 10 });
      expect(result.success).toBe(true);
      expect(result.output).toEqual(mockMultiResults);
    });

    it('should use defaultMultiSearch from constructor when input omits multiSearch', async () => {
      const toolWithDefault = new WebSearchTool(mockSearchService, true);
      const mockMultiResults = {
        results: [],
        metadata: { query: 'test', timestamp: new Date().toISOString(), totalResponseTime: 50, providersQueried: [], providersSucceeded: [], providersFailed: [], totalRawResults: 0, deduplicatedCount: 0 },
      };
      mockSearchService.multiSearch = vi.fn().mockResolvedValue(mockMultiResults);

      await toolWithDefault.execute({ query: 'test' }, ctx);

      expect(mockSearchService.multiSearch).toHaveBeenCalled();
    });

    it('should fall back to single search when provider is specified even with multiSearch', async () => {
      mockSearchService.search = vi.fn().mockResolvedValue({ provider: 'serper', results: [], metadata: {} });

      await tool.execute({ query: 'test', multiSearch: true, provider: 'serper' }, ctx);

      // When provider is specified, multiSearch is ignored — single provider search is used
      expect(mockSearchService.search).toHaveBeenCalled();
    });
  });

  describe('validateArgs - multiSearch', () => {
    it('should reject multiSearch + provider combination', () => {
      const result = tool.validateArgs({ query: 'test', multiSearch: true, provider: 'serper' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cannot specify both multiSearch and a specific provider');
    });

    it('should reject non-boolean multiSearch', () => {
      const result = tool.validateArgs({ query: 'test', multiSearch: 'yes' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('multiSearch must be a boolean');
    });

    it('should accept multiSearch: true without provider', () => {
      const result = tool.validateArgs({ query: 'test', multiSearch: true });
      expect(result.isValid).toBe(true);
    });
  });

  describe('inputSchema', () => {
    it('should return proper JSON schema', () => {
      const schema = tool.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(['query']);
      expect(schema.properties.query.type).toBe('string');
      expect(schema.properties.maxResults.type).toBe('integer');
      expect(schema.properties.provider.enum).toContain('serper');
    });

    it('should include multiSearch in schema', () => {
      const schema = tool.inputSchema;
      expect(schema.properties.multiSearch).toBeDefined();
      expect(schema.properties.multiSearch.type).toBe('boolean');
      expect(schema.properties.multiSearch.default).toBe(false);
    });
  });
});

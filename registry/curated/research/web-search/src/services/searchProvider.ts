/**
 * Configuration for search providers
 */
export interface SearchProviderConfig {
  serperApiKey?: string;
  serpApiKey?: string;
  braveApiKey?: string;
  maxRetries?: number;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Search result structure
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position?: number;
}

/**
 * Provider-specific response
 */
export interface ProviderResponse {
  provider: string;
  results: SearchResult[];
  metadata: {
    query: string;
    timestamp: string;
    responseTime?: number;
    fallback?: boolean;
  };
}

/**
 * A search result enriched with cross-provider agreement data.
 */
export interface MultiSearchResult extends SearchResult {
  /** Which providers returned this URL */
  providers: string[];
  /** Number of providers that returned this URL */
  agreementCount: number;
  /** Confidence score (0-100) based on cross-provider agreement + position */
  confidenceScore: number;
  /** The position this result appeared at in each provider's results */
  providerPositions: Record<string, number>;
}

/**
 * Response from a multi-provider parallel search aggregation.
 */
export interface MultiSearchResponse {
  results: MultiSearchResult[];
  metadata: {
    query: string;
    timestamp: string;
    totalResponseTime: number;
    providersQueried: string[];
    providersSucceeded: string[];
    providersFailed: string[];
    totalRawResults: number;
    deduplicatedCount: number;
  };
}

/**
 * Service for managing multiple search providers with fallback support
 * 
 * @class SearchProviderService
 * 
 * @example
 * ```typescript
 * const service = new SearchProviderService({
 *   serperApiKey: 'your-key',
 *   rateLimit: { maxRequests: 10, windowMs: 60000 }
 * });
 * 
 * const results = await service.search('query');
 * ```
 */
export class SearchProviderService {
  private config: SearchProviderConfig;
  private rateLimitState: Map<string, { count: number; resetTime: number }>;
  
  /**
   * Creates an instance of SearchProviderService
   * 
   * @param {SearchProviderConfig} config - Configuration for the service
   */
  constructor(config: SearchProviderConfig) {
    this.config = {
      serperApiKey: config.serperApiKey,
      serpApiKey: config.serpApiKey,
      braveApiKey: config.braveApiKey,
      maxRetries: config.maxRetries ?? 3,
      rateLimit: config.rateLimit ?? {
        maxRequests: 10,
        windowMs: 60000,
      },
    };
    this.rateLimitState = new Map();
  }
  
  /**
   * Performs a search across available providers with automatic fallback
   * 
   * @param {string} query - The search query
   * @param {Object} options - Search options
   * @param {number} [options.maxResults=10] - Maximum results to return
   * @param {string} [options.provider] - Specific provider to use
   * @returns {Promise<ProviderResponse>} Search results with metadata
   * 
   * @throws {Error} If all providers fail and no fallback is available
   */
  async search(
    query: string, 
    options: { 
      maxResults?: number; 
      provider?: string 
    } = {}
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const maxResults = options.maxResults || 10;
    
    // If specific provider requested, try only that one
    if (options.provider) {
      return this.searchWithProvider(query, options.provider, maxResults, startTime);
    }
    
    // Try providers in order of preference
    const providers = this.getAvailableProviders();
    
    for (const provider of providers) {
      try {
        if (await this.checkRateLimit(provider)) {
          return await this.searchWithProvider(query, provider, maxResults, startTime);
        }
      } catch (error) {
        console.warn(`Provider ${provider} failed:`, error);
        continue;
      }
    }
    
    // Final fallback to DuckDuckGo (no API key required)
    return this.searchDuckDuckGo(query, maxResults, startTime);
  }
  
  /**
   * Searches using a specific provider
   * 
   * @private
   * @param {string} query - Search query
   * @param {string} provider - Provider name
   * @param {number} maxResults - Maximum results
   * @param {number} startTime - Request start timestamp
   * @returns {Promise<ProviderResponse>} Search results
   */
  private async searchWithProvider(
    query: string,
    provider: string,
    maxResults: number,
    startTime: number
  ): Promise<ProviderResponse> {
    let results: SearchResult[];
    
    switch (provider) {
      case 'serper':
        results = await this.searchSerper(query, maxResults);
        break;
      case 'serpapi':
        results = await this.searchSerpApi(query, maxResults);
        break;
      case 'brave':
        results = await this.searchBrave(query, maxResults);
        break;
      case 'duckduckgo':
      default:
        results = await this.searchDuckDuckGoAPI(query, maxResults);
        break;
    }
    
    return {
      provider,
      results: results.slice(0, maxResults),
      metadata: {
        query,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime
      }
    };
  }
  
  /**
   * Gets list of available providers based on configured API keys
   *
   * @returns {string[]} Array of available provider names
   */
  public getAvailableProviders(): string[] {
    const providers: string[] = [];
    
    if (this.config.serperApiKey) providers.push('serper');
    if (this.config.serpApiKey) providers.push('serpapi');
    if (this.config.braveApiKey) providers.push('brave');
    
    return providers;
  }
  
  /**
   * Checks if a provider is within rate limits
   * 
   * @private
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} True if within limits
   */
  private async checkRateLimit(provider: string): Promise<boolean> {
    const now = Date.now();
    const state = this.rateLimitState.get(provider);
    
    if (!state || now > state.resetTime) {
      this.rateLimitState.set(provider, {
        count: 1,
        resetTime: now + this.config.rateLimit!.windowMs
      });
      return true;
    }
    
    if (state.count >= this.config.rateLimit!.maxRequests) {
      return false;
    }
    
    state.count++;
    return true;
  }
  
  /**
   * Search using Serper.dev API
   * 
   * @private
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results
   * @returns {Promise<SearchResult[]>} Search results
   */
  private async searchSerper(query: string, maxResults: number): Promise<SearchResult[]> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.config.serperApiKey!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: maxResults })
    });
    
    if (!response.ok) throw new Error(`Serper API error: ${response.statusText}`);
    
    const data = (await response.json()) as any;
    return (data.organic || []).map((item: any) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      position: item.position
    }));
  }
  
  /**
   * Search using SerpAPI
   * 
   * @private
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results
   * @returns {Promise<SearchResult[]>} Search results
   */
  private async searchSerpApi(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      api_key: this.config.serpApiKey!,
      num: maxResults.toString()
    });
    
    const response = await fetch(`https://serpapi.com/search?${params}`);
    if (!response.ok) throw new Error(`SerpAPI error: ${response.statusText}`);
    
    const data = (await response.json()) as any;
    return (data.organic_results || []).map((item: any) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      position: item.position
    }));
  }
  
  /**
   * Search using Brave Search API
   * 
   * @private
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results
   * @returns {Promise<SearchResult[]>} Search results
   */
  private async searchBrave(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      count: maxResults.toString()
    });
    
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'X-Subscription-Token': this.config.braveApiKey!
      }
    });
    
    if (!response.ok) throw new Error(`Brave API error: ${response.statusText}`);
    
    const data = (await response.json()) as any;
    return (data.web?.results || []).map((item: any, index: number) => ({
      title: item.title,
      url: item.url,
      snippet: item.description,
      position: index + 1
    }));
  }
  
  /**
   * Search using DuckDuckGo (HTML scraping fallback)
   * 
   * @private
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results
   * @param {number} startTime - Request start timestamp
   * @returns {Promise<ProviderResponse>} Search results
   */
  private async searchDuckDuckGo(
    query: string, 
    maxResults: number,
    startTime: number
  ): Promise<ProviderResponse> {
    try {
      const results = await this.searchDuckDuckGoAPI(query, maxResults);
      return {
        provider: 'duckduckgo',
        results,
        metadata: {
          query,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          fallback: true
        }
      };
    } catch (error) {
      // Return empty results rather than throwing
      return {
        provider: 'duckduckgo',
        results: [],
        metadata: {
          query,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          fallback: true
        }
      };
    }
  }
  
  /**
   * Search using DuckDuckGo instant answer API
   * 
   * @private
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results
   * @returns {Promise<SearchResult[]>} Search results
   */
  private async searchDuckDuckGoAPI(query: string, maxResults: number): Promise<SearchResult[]> {
    // DuckDuckGo instant answer API (limited but free)
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1'
    });
    
    const response = await fetch(`https://api.duckduckgo.com/?${params}`);
    const data = (await response.json()) as any;
    
    const results: SearchResult[] = [];
    
    // Add instant answer if available
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText
      });
    }
    
    // Add related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, maxResults - 1)) {
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text
          });
        }
      }
    }
    
    return results.slice(0, maxResults);
  }
  
  /**
   * Normalizes a URL for deduplication — strips www, tracking params, trailing slash.
   */
  static normalizeUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      url.hostname = url.hostname.replace(/^www\./, '');
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'sxsrf', 'ei', 'ved',
      ];
      for (const param of trackingParams) url.searchParams.delete(param);
      url.searchParams.sort();
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      return url.toString();
    } catch {
      return rawUrl.toLowerCase().trim();
    }
  }

  /**
   * Searches ALL available providers in parallel, then merges, deduplicates,
   * and reranks results by cross-provider agreement.
   */
  async multiSearch(
    query: string,
    options: { maxResults?: number } = {},
  ): Promise<MultiSearchResponse> {
    const startTime = Date.now();
    const maxResults = options.maxResults || 10;

    const providers = [...new Set([...this.getAvailableProviders(), 'duckduckgo'])];

    const providerResults = await Promise.allSettled(
      providers.map(async (provider) => {
        try {
          if (provider !== 'duckduckgo' && !(await this.checkRateLimit(provider))) {
            throw new Error(`Rate limit exceeded for ${provider}`);
          }
          const response = await this.searchWithProvider(query, provider, maxResults, startTime);
          return { provider, results: response.results, success: true as const };
        } catch {
          return { provider, results: [] as SearchResult[], success: false as const };
        }
      }),
    );

    const succeeded: string[] = [];
    const failed: string[] = [];
    const allResults: Array<{ provider: string; result: SearchResult; position: number }> = [];

    for (const outcome of providerResults) {
      if (outcome.status === 'fulfilled') {
        const { provider, results, success } = outcome.value;
        if (success && results.length > 0) {
          succeeded.push(provider);
          results.forEach((result, index) => {
            allResults.push({ provider, result, position: index + 1 });
          });
        } else {
          failed.push(provider);
        }
      } else {
        failed.push('unknown');
      }
    }

    // Deduplicate and merge by normalized URL
    const merged = new Map<string, MultiSearchResult>();

    for (const { provider, result, position } of allResults) {
      const key = SearchProviderService.normalizeUrl(result.url);

      if (merged.has(key)) {
        const existing = merged.get(key)!;
        if (!existing.providers.includes(provider)) {
          existing.providers.push(provider);
          existing.agreementCount = existing.providers.length;
        }
        existing.providerPositions[provider] = position;
        if ((result.snippet?.length || 0) > (existing.snippet?.length || 0)) {
          existing.snippet = result.snippet;
        }
      } else {
        merged.set(key, {
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          position,
          providers: [provider],
          agreementCount: 1,
          confidenceScore: 0,
          providerPositions: { [provider]: position },
        });
      }
    }

    // Score and rank
    const totalProviders = succeeded.length || 1;
    const scoredResults = Array.from(merged.values()).map((r) => {
      const agreementBonus = (r.agreementCount / totalProviders) * 50;
      const positions = Object.values(r.providerPositions);
      const avgNorm = positions.reduce((s, p) => s + (1 - (p - 1) / maxResults), 0) / positions.length;
      const positionScore = avgNorm * 30;
      r.confidenceScore = Math.round(Math.min(100, agreementBonus + positionScore + 20));
      return r;
    });

    scoredResults.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return {
      results: scoredResults.slice(0, maxResults),
      metadata: {
        query,
        timestamp: new Date().toISOString(),
        totalResponseTime: Date.now() - startTime,
        providersQueried: providers,
        providersSucceeded: succeeded,
        providersFailed: failed,
        totalRawResults: allResults.length,
        deduplicatedCount: merged.size,
      },
    };
  }

  /**
   * Gets recommended search providers with signup information
   *
   * @static
   * @returns {Array} Array of provider recommendations
   */
  static getRecommendedProviders() {
    return [
      {
        name: 'Serper',
        signupUrl: 'https://serper.dev',
        freeQuota: '2,500 queries/month',
        description: 'Google search results API'
      },
      {
        name: 'SerpAPI',
        signupUrl: 'https://serpapi.com',
        freeQuota: '100 searches/month',
        description: 'Multiple search engines API'
      },
      {
        name: 'Brave Search',
        signupUrl: 'https://brave.com/search-api',
        freeQuota: '2,000 queries/month',
        description: 'Privacy-focused search API'
      },
      {
        name: 'DuckDuckGo',
        signupUrl: 'No signup required',
        freeQuota: 'Unlimited (rate limited)',
        description: 'Privacy-focused, no API key needed'
      }
    ];
  }
}

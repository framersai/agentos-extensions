import { ITool } from '@agentos/core';
import { SearchProviderService } from '../services/searchProvider';

/**
 * Research aggregator tool that performs multiple searches and synthesizes results
 * 
 * @class ResearchAggregatorTool
 * @implements {ITool}
 * 
 * @example
 * ```typescript
 * const tool = new ResearchAggregatorTool(searchService);
 * const result = await tool.execute({
 *   topic: 'AI safety research',
 *   sources: 3,
 *   depth: 'comprehensive'
 * });
 * ```
 */
export class ResearchAggregatorTool implements ITool {
  public readonly id = 'researchAggregator';
  public readonly name = 'Research Aggregator';
  public readonly description = 'Aggregate research from multiple searches on a topic';
  
  /**
   * Creates an instance of ResearchAggregatorTool
   * @param {SearchProviderService} searchService - The search provider service
   */
  constructor(private searchService: SearchProviderService) {}
  
  /**
   * Executes research aggregation on a topic
   * 
   * @param {Object} input - The research parameters
   * @param {string} input.topic - The research topic
   * @param {number} [input.sources=3] - Number of different search angles to explore
   * @param {string} [input.depth='moderate'] - Research depth (quick, moderate, comprehensive)
   * @returns {Promise<{success: boolean, output?: any, error?: string}>} Aggregated research results
   */
  async execute(input: {
    topic: string;
    sources?: number;
    depth?: 'quick' | 'moderate' | 'comprehensive';
  }): Promise<{ success: boolean; output?: any; error?: string }> {
    try {
      const sources = input.sources || 3;
      const depth = input.depth || 'moderate';
      
      // Generate different search queries for comprehensive coverage
      const queries = this.generateSearchQueries(input.topic, sources, depth);
      
      // Perform searches in parallel
      const searchPromises = queries.map(query => 
        this.searchService.search(query, {
          maxResults: depth === 'quick' ? 5 : depth === 'moderate' ? 10 : 15
        }).catch(err => ({ 
          provider: 'error', 
          results: [], 
          metadata: { query, error: err.message, timestamp: new Date().toISOString() }
        }))
      );
      
      const searchResults = await Promise.all(searchPromises);
      
      // Aggregate and deduplicate results
      const aggregated = this.aggregateResults(searchResults, input.topic);
      
      return {
        success: true,
        output: {
          topic: input.topic,
          sources: sources,
          depth: depth,
          queries: queries,
          aggregatedResults: aggregated,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Generates diverse search queries for comprehensive research
   * 
   * @private
   * @param {string} topic - The research topic
   * @param {number} count - Number of queries to generate
   * @param {string} depth - Research depth level
   * @returns {string[]} Array of search queries
   */
  private generateSearchQueries(topic: string, count: number, depth: string): string[] {
    const queries: string[] = [topic]; // Start with the original topic
    
    const modifiers = {
      quick: ['overview', 'summary'],
      moderate: ['overview', 'recent developments', 'key concepts', 'applications'],
      comprehensive: [
        'overview',
        'recent research',
        'state of the art',
        'challenges',
        'future directions',
        'industry applications',
        'academic papers',
        'expert opinions'
      ]
    };
    
    const selectedModifiers = modifiers[depth as keyof typeof modifiers];
    
    for (let i = 1; i < Math.min(count, selectedModifiers.length + 1); i++) {
      if (selectedModifiers[i - 1]) {
        queries.push(`${topic} ${selectedModifiers[i - 1]}`);
      }
    }
    
    return queries;
  }
  
  /**
   * Aggregates and deduplicates search results
   * 
   * @private
   * @param {any[]} searchResults - Array of search results from different queries
   * @param {string} topic - The original research topic
   * @returns {Object} Aggregated and organized results
   */
  private aggregateResults(searchResults: any[], topic: string): any {
    const seenUrls = new Set<string>();
    const categories = {
      overview: [] as any[],
      research: [] as any[],
      applications: [] as any[],
      resources: [] as any[]
    };
    
    for (const searchResult of searchResults) {
      if (!searchResult.results) continue;
      
      for (const result of searchResult.results) {
        // Skip duplicates
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);
        
        // Categorize based on content
        const lowerTitle = result.title.toLowerCase();
        const lowerSnippet = result.snippet.toLowerCase();
        
        if (lowerTitle.includes('overview') || lowerTitle.includes('introduction') || 
            lowerTitle.includes('what is')) {
          categories.overview.push(result);
        } else if (lowerTitle.includes('research') || lowerTitle.includes('study') || 
                   lowerTitle.includes('paper') || lowerTitle.includes('journal')) {
          categories.research.push(result);
        } else if (lowerTitle.includes('application') || lowerTitle.includes('use case') || 
                   lowerTitle.includes('implementation')) {
          categories.applications.push(result);
        } else {
          categories.resources.push(result);
        }
      }
    }
    
    // Calculate relevance scores
    const scoredCategories = Object.entries(categories).reduce((acc, [key, items]) => {
      acc[key] = items.map((item: any) => ({
        ...item,
        relevanceScore: this.calculateRelevance(item, topic)
      })).sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);
      return acc;
    }, {} as any);
    
    return {
      categories: scoredCategories,
      totalResults: seenUrls.size,
      topResults: this.getTopResults(scoredCategories, 10)
    };
  }
  
  /**
   * Calculates relevance score for a search result
   * 
   * @private
   * @param {any} result - Search result object
   * @param {string} topic - Original topic for comparison
   * @returns {number} Relevance score (0-100)
   */
  private calculateRelevance(result: any, topic: string): number {
    let score = 50; // Base score
    
    const topicWords = topic.toLowerCase().split(/\s+/);
    const titleWords = result.title.toLowerCase();
    const snippetWords = result.snippet.toLowerCase();
    
    // Check title relevance
    for (const word of topicWords) {
      if (titleWords.includes(word)) score += 15;
      if (snippetWords.includes(word)) score += 5;
    }
    
    // Boost for certain indicators
    if (titleWords.includes('official')) score += 10;
    if (titleWords.includes('guide')) score += 5;
    if (titleWords.includes('tutorial')) score += 5;
    
    return Math.min(100, score);
  }
  
  /**
   * Gets top results across all categories
   * 
   * @private
   * @param {any} categories - Categorized results
   * @param {number} count - Number of top results to return
   * @returns {any[]} Top results by relevance
   */
  private getTopResults(categories: any, count: number): any[] {
    const allResults: any[] = [];
    
    for (const items of Object.values(categories)) {
      allResults.push(...(items as any[]));
    }
    
    return allResults
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, count);
  }
  
  /**
   * Validates input parameters
   * 
   * @param {any} input - Input to validate
   * @returns {{valid: boolean, errors: string[]}} Validation result
   */
  validate(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!input.topic) {
      errors.push('Topic is required');
    } else if (typeof input.topic !== 'string') {
      errors.push('Topic must be a string');
    }
    
    if (input.sources !== undefined) {
      if (typeof input.sources !== 'number' || input.sources < 1 || input.sources > 10) {
        errors.push('Sources must be a number between 1 and 10');
      }
    }
    
    if (input.depth !== undefined) {
      if (!['quick', 'moderate', 'comprehensive'].includes(input.depth)) {
        errors.push('Depth must be quick, moderate, or comprehensive');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Returns the JSON schema for the tool's input
   * 
   * @returns {Object} JSON Schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      required: ['topic'],
      properties: {
        topic: {
          type: 'string',
          description: 'The research topic to aggregate information about'
        },
        sources: {
          type: 'number',
          description: 'Number of different search angles to explore',
          default: 3,
          minimum: 1,
          maximum: 10
        },
        depth: {
          type: 'string',
          description: 'Research depth level',
          enum: ['quick', 'moderate', 'comprehensive'],
          default: 'moderate'
        }
      }
    };
  }
}
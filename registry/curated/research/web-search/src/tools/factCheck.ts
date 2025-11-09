import { ITool } from '@agentos/core';
import { SearchProviderService } from '../services/searchProvider';

/**
 * Fact checking tool that verifies statements against web sources
 * 
 * @class FactCheckTool
 * @implements {ITool}
 * 
 * @example
 * ```typescript
 * const tool = new FactCheckTool(searchService);
 * const result = await tool.execute({
 *   statement: 'The Earth orbits the Sun',
 *   checkSources: true,
 *   confidence: 'high'
 * });
 * ```
 */
export class FactCheckTool implements ITool {
  public readonly id = 'factCheck';
  public readonly name = 'Fact Check';
  public readonly description = 'Verify facts and statements against web sources';
  
  /**
   * Creates an instance of FactCheckTool
   * @param {SearchProviderService} searchService - The search provider service
   */
  constructor(private searchService: SearchProviderService) {}
  
  /**
   * Executes fact checking on a statement
   * 
   * @param {Object} input - The fact check parameters
   * @param {string} input.statement - The statement to fact-check
   * @param {boolean} [input.checkSources=true] - Whether to include source citations
   * @param {string} [input.confidence='medium'] - Required confidence level
   * @returns {Promise<{success: boolean, output?: any, error?: string}>} Fact check results
   */
  async execute(input: {
    statement: string;
    checkSources?: boolean;
    confidence?: 'low' | 'medium' | 'high';
  }): Promise<{ success: boolean; output?: any; error?: string }> {
    try {
      const checkSources = input.checkSources !== false;
      const requiredConfidence = input.confidence || 'medium';
      
      // Search for information about the statement
      const queries = this.generateFactCheckQueries(input.statement);
      
      // Perform searches in parallel
      const searchPromises = queries.map(query => 
        this.searchService.search(query, { maxResults: 5 })
          .catch(err => ({ 
            provider: 'error', 
            results: [], 
            metadata: { query, error: err.message, timestamp: new Date().toISOString() }
          }))
      );
      
      const searchResults = await Promise.all(searchPromises);
      
      // Analyze results for fact verification
      const analysis = this.analyzeFactCheckResults(
        input.statement, 
        searchResults,
        requiredConfidence
      );
      
      // Compile sources if requested
      const sources = checkSources ? this.compileSources(searchResults) : [];
      
      return {
        success: true,
        output: {
          statement: input.statement,
          verdict: analysis.verdict,
          confidence: analysis.confidence,
          explanation: analysis.explanation,
          sources: sources,
          contradictingSources: analysis.contradictingSources,
          supportingSources: analysis.supportingSources,
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
   * Generates queries for fact-checking a statement
   * 
   * @private
   * @param {string} statement - The statement to check
   * @returns {string[]} Array of search queries
   */
  private generateFactCheckQueries(statement: string): string[] {
    return [
      statement, // Original statement
      `"${statement}" fact check`, // Exact match with fact check
      `${statement} true or false`, // Truth verification
      `${statement} debunked myths`, // Check for debunking
      `is it true that ${statement}` // Question format
    ];
  }
  
  /**
   * Analyzes search results to determine fact validity
   * 
   * @private
   * @param {string} statement - Original statement
   * @param {any[]} searchResults - Search results to analyze
   * @param {string} requiredConfidence - Required confidence level
   * @returns {Object} Analysis results with verdict and confidence
   */
  private analyzeFactCheckResults(
    statement: string, 
    searchResults: any[],
    requiredConfidence: string
  ): any {
    let supportingCount = 0;
    let contradictingCount = 0;
    let neutralCount = 0;
    const supportingSources: string[] = [];
    const contradictingSources: string[] = [];
    
    const statementLower = statement.toLowerCase();
    const negativeIndicators = ['false', 'myth', 'debunked', 'incorrect', 'wrong', 'not true', 'fake'];
    const positiveIndicators = ['true', 'correct', 'accurate', 'confirmed', 'verified', 'fact'];
    
    for (const searchResult of searchResults) {
      if (!searchResult.results) continue;
      
      for (const result of searchResult.results) {
        const contentLower = (result.title + ' ' + result.snippet).toLowerCase();
        
        // Check for fact-checking sites
        const isFactCheckSite = result.url.includes('snopes') || 
                                result.url.includes('factcheck') || 
                                result.url.includes('politifact');
        
        const weight = isFactCheckSite ? 2 : 1; // Give more weight to fact-checking sites
        
        // Analyze sentiment toward the statement
        let hasNegative = negativeIndicators.some(ind => contentLower.includes(ind));
        let hasPositive = positiveIndicators.some(ind => contentLower.includes(ind));
        
        if (hasNegative && !hasPositive) {
          contradictingCount += weight;
          contradictingSources.push(result.url);
        } else if (hasPositive && !hasNegative) {
          supportingCount += weight;
          supportingSources.push(result.url);
        } else {
          neutralCount += 1;
        }
      }
    }
    
    // Calculate confidence and verdict
    const total = supportingCount + contradictingCount + neutralCount;
    let confidence: number;
    let verdict: 'TRUE' | 'FALSE' | 'UNVERIFIED' | 'PARTIALLY TRUE';
    let explanation: string;
    
    if (total === 0) {
      verdict = 'UNVERIFIED';
      confidence = 0;
      explanation = 'No relevant sources found to verify this statement.';
    } else {
      const supportRatio = supportingCount / total;
      const contradictRatio = contradictingCount / total;
      
      if (supportRatio > 0.7) {
        verdict = 'TRUE';
        confidence = supportRatio * 100;
        explanation = `Strong evidence supports this statement (${supportingCount} supporting sources).`;
      } else if (contradictRatio > 0.7) {
        verdict = 'FALSE';
        confidence = contradictRatio * 100;
        explanation = `Strong evidence contradicts this statement (${contradictingCount} contradicting sources).`;
      } else if (supportRatio > 0.4 && contradictRatio > 0.4) {
        verdict = 'PARTIALLY TRUE';
        confidence = 50;
        explanation = `Mixed evidence with both supporting and contradicting sources.`;
      } else {
        verdict = 'UNVERIFIED';
        confidence = Math.max(supportRatio, contradictRatio) * 100;
        explanation = `Insufficient clear evidence to verify this statement.`;
      }
    }
    
    // Adjust confidence based on required level
    const confidenceLevel = confidence > 80 ? 'high' : confidence > 50 ? 'medium' : 'low';
    
    return {
      verdict,
      confidence: Math.round(confidence),
      confidenceLevel,
      explanation,
      supportingSources: supportingSources.slice(0, 5),
      contradictingSources: contradictingSources.slice(0, 5),
      meetsRequiredConfidence: this.meetsConfidenceRequirement(confidenceLevel, requiredConfidence)
    };
  }
  
  /**
   * Checks if confidence level meets requirement
   * 
   * @private
   * @param {string} actual - Actual confidence level
   * @param {string} required - Required confidence level
   * @returns {boolean} True if requirement is met
   */
  private meetsConfidenceRequirement(actual: string, required: string): boolean {
    const levels = { low: 1, medium: 2, high: 3 };
    return levels[actual as keyof typeof levels] >= levels[required as keyof typeof levels];
  }
  
  /**
   * Compiles relevant sources from search results
   * 
   * @private
   * @param {any[]} searchResults - Search results to compile from
   * @returns {any[]} Compiled sources with metadata
   */
  private compileSources(searchResults: any[]): any[] {
    const sources: any[] = [];
    const seenUrls = new Set<string>();
    
    for (const searchResult of searchResults) {
      if (!searchResult.results) continue;
      
      for (const result of searchResult.results) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);
        
        sources.push({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          provider: searchResult.provider,
          query: searchResult.metadata.query
        });
      }
    }
    
    return sources.slice(0, 10); // Limit to top 10 sources
  }
  
  /**
   * Validates input parameters
   * 
   * @param {any} input - Input to validate
   * @returns {{valid: boolean, errors: string[]}} Validation result
   */
  validate(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!input.statement) {
      errors.push('Statement is required');
    } else if (typeof input.statement !== 'string') {
      errors.push('Statement must be a string');
    } else if (input.statement.length < 5) {
      errors.push('Statement must be at least 5 characters long');
    }
    
    if (input.confidence !== undefined) {
      if (!['low', 'medium', 'high'].includes(input.confidence)) {
        errors.push('Confidence must be low, medium, or high');
      }
    }
    
    if (input.checkSources !== undefined && typeof input.checkSources !== 'boolean') {
      errors.push('checkSources must be a boolean');
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
      required: ['statement'],
      properties: {
        statement: {
          type: 'string',
          description: 'The statement to fact-check',
          minLength: 5
        },
        checkSources: {
          type: 'boolean',
          description: 'Whether to include source citations',
          default: true
        },
        confidence: {
          type: 'string',
          description: 'Required confidence level for the verdict',
          enum: ['low', 'medium', 'high'],
          default: 'medium'
        }
      }
    };
  }
}
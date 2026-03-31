/** Input for the verify_citations tool. */
export interface VerifyCitationsInput {
  text: string;
  sources?: Array<{ title?: string; content: string; url?: string }>;
  webFallback?: boolean;
}

/** Output of the verify_citations tool. */
export interface VerifyCitationsOutput {
  claims: Array<{
    text: string;
    verdict: 'supported' | 'contradicted' | 'unverifiable' | 'weak';
    confidence: number;
    source?: { title?: string; snippet: string; url?: string };
    webVerified?: boolean;
  }>;
  totalClaims: number;
  supportedCount: number;
  contradictedCount: number;
  unverifiableCount: number;
  supportedRatio: number;
  summary: string;
}

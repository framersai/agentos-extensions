// @ts-nocheck
/**
 * @fileoverview Prompt templates for the Deep Research Engine's LLM calls.
 *
 * All prompts request JSON output for reliable parsing.
 * Fallback: line-by-line extraction if JSON parse fails.
 */

export const DECOMPOSITION_PROMPT = `You are a research planner. Break the following research query into 3-5 specific, searchable sub-questions that together would provide a comprehensive answer.

Research query: "{query}"
{focusAreas}

Reply with ONLY a JSON array of strings. Example:
["What is X?", "How does X affect Y?", "What are the latest statistics on X?"]

Sub-questions:`;

export const GAP_ANALYSIS_PROMPT = `You are a research analyst reviewing findings so far. Identify 2-3 important aspects that are still missing, under-explored, or need verification.

Original query: "{query}"

Findings so far:
{findings}

Reply with ONLY a JSON array of follow-up search queries to fill the gaps. Example:
["What are the counter-arguments to X?", "What do recent studies say about Y?"]

Follow-up queries:`;

export const SYNTHESIS_PROMPT = `You are a senior research analyst. Synthesize the following research findings into a comprehensive, well-structured report.

Original query: "{query}"

Collected evidence (with source URLs):
{evidence}

Write a report with these sections:
1. **Executive Summary** (2-3 sentences answering the query directly)
2. **Detailed Findings** (organized by theme, with inline citations like [Source: url])
3. **Knowledge Gaps** (what couldn't be fully answered)

Be factual. Cite sources inline. If evidence is conflicting, note both sides. Do not fabricate information beyond what the evidence shows.`;

/**
 * Parses a JSON array from LLM output, with fallback to line-by-line extraction.
 */
export function parseJsonArray(text: string): string[] {
  // Try JSON parse first
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed.filter(s => s.trim().length > 0);
      }
    } catch { /* fall through */ }
  }

  // Fallback: extract lines that look like questions/queries
  return text
    .split('\n')
    .map(line => line.replace(/^[\s\-*\d.)"]+/, '').replace(/["]+$/g, '').trim())
    .filter(line => line.length > 10 && line.length < 200)
    .slice(0, 5);
}

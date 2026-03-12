/**
 * @fileoverview Budget enforcement for the Deep Research Engine.
 *
 * Tracks search queries, page extractions, LLM calls, and wall-clock time
 * against hard caps defined by {@link ResearchBudget}.
 */

import type { ResearchBudget } from './types.js';

export class ResearchBudgetTracker {
  private searchesUsed = 0;
  private extractionsUsed = 0;
  private llmCallsUsed = 0;
  private readonly startTime: number;

  constructor(private readonly budget: ResearchBudget) {
    this.startTime = Date.now();
  }

  // ── Queries ──

  canSearch(): boolean {
    return this.searchesUsed < this.budget.maxSearchQueries && !this.isTimedOut();
  }

  canExtract(): boolean {
    return this.extractionsUsed < this.budget.maxPageExtractions && !this.isTimedOut();
  }

  canCallLLM(): boolean {
    return this.llmCallsUsed < this.budget.maxLLMCalls && !this.isTimedOut();
  }

  isTimedOut(): boolean {
    return Date.now() - this.startTime >= this.budget.maxTotalTimeMs;
  }

  isExhausted(): boolean {
    return (
      this.isTimedOut() ||
      (this.searchesUsed >= this.budget.maxSearchQueries &&
        this.extractionsUsed >= this.budget.maxPageExtractions)
    );
  }

  // ── Mutations ──

  recordSearch(): void {
    this.searchesUsed++;
  }

  recordExtraction(): void {
    this.extractionsUsed++;
  }

  recordLLMCall(): void {
    this.llmCallsUsed++;
  }

  // ── Snapshot ──

  getUsed() {
    return {
      searchesUsed: this.searchesUsed,
      extractionsUsed: this.extractionsUsed,
      llmCallsUsed: this.llmCallsUsed,
    };
  }

  getRemaining() {
    return {
      searches: Math.max(0, this.budget.maxSearchQueries - this.searchesUsed),
      extractions: Math.max(0, this.budget.maxPageExtractions - this.extractionsUsed),
      llmCalls: Math.max(0, this.budget.maxLLMCalls - this.llmCallsUsed),
      timeMs: Math.max(0, this.budget.maxTotalTimeMs - (Date.now() - this.startTime)),
    };
  }

  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}

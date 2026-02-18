/**
 * @fileoverview 2captcha integration for solving CAPTCHAs.
 *
 * Supports reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, and image captchas.
 */

import type { ICaptchaProvider, CaptchaSolution } from './ICaptchaProvider.js';

export class CaptchaSolver implements ICaptchaProvider {
  readonly name = '2captcha';
  private apiKey: string;
  private baseUrl = 'https://2captcha.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async solveRecaptchaV2(siteKey: string, pageUrl: string): Promise<CaptchaSolution> {
    return this.solve({
      method: 'userrecaptcha',
      googlekey: siteKey,
      pageurl: pageUrl,
    });
  }

  async solveRecaptchaV3(siteKey: string, pageUrl: string, action = 'verify'): Promise<CaptchaSolution> {
    return this.solve({
      method: 'userrecaptcha',
      googlekey: siteKey,
      pageurl: pageUrl,
      version: 'v3',
      action,
      min_score: '0.7',
    });
  }

  async solveHCaptcha(siteKey: string, pageUrl: string): Promise<CaptchaSolution> {
    return this.solve({
      method: 'hcaptcha',
      sitekey: siteKey,
      pageurl: pageUrl,
    });
  }

  async solveTurnstile(siteKey: string, pageUrl: string): Promise<CaptchaSolution> {
    return this.solve({
      method: 'turnstile',
      sitekey: siteKey,
      pageurl: pageUrl,
    });
  }

  async solveImage(imageBase64: string): Promise<string> {
    const result = await this.solve({
      method: 'base64',
      body: imageBase64,
    });
    return result.token;
  }

  async getBalance(): Promise<number> {
    const url = `${this.baseUrl}/res.php?key=${this.apiKey}&action=getbalance&json=1`;
    const res = await fetch(url);
    const data = await res.json();
    return parseFloat(data.request) || 0;
  }

  // ── Internal ──

  private async solve(params: Record<string, string>): Promise<CaptchaSolution> {
    const start = Date.now();

    // Submit task
    const submitUrl = `${this.baseUrl}/in.php`;
    const body = new URLSearchParams({ key: this.apiKey, json: '1', ...params });
    const submitRes = await fetch(submitUrl, { method: 'POST', body });
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      throw new Error(`2captcha submit failed: ${submitData.request}`);
    }

    const taskId = submitData.request;

    // Poll for result
    const resultUrl = `${this.baseUrl}/res.php?key=${this.apiKey}&action=get&id=${taskId}&json=1`;
    const maxAttempts = 60;
    const pollInterval = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const res = await fetch(resultUrl);
      const data = await res.json();

      if (data.status === 1) {
        return { token: data.request, solveTimeMs: Date.now() - start };
      }

      if (data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2captcha solve failed: ${data.request}`);
      }
    }

    throw new Error('2captcha solve timed out');
  }
}

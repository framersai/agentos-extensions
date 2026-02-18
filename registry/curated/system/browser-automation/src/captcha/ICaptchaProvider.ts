/**
 * @fileoverview Interface for captcha solving services.
 */

export interface CaptchaSolution {
  token: string;
  solveTimeMs: number;
}

export interface ICaptchaProvider {
  readonly name: string;

  solveRecaptchaV2(siteKey: string, pageUrl: string): Promise<CaptchaSolution>;
  solveRecaptchaV3(siteKey: string, pageUrl: string, action?: string): Promise<CaptchaSolution>;
  solveHCaptcha(siteKey: string, pageUrl: string): Promise<CaptchaSolution>;
  solveTurnstile(siteKey: string, pageUrl: string): Promise<CaptchaSolution>;
  solveImage(imageBase64: string): Promise<string>;
  getBalance(): Promise<number>;
}

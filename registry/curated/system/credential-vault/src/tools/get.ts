import type { CredentialVaultService } from '../CredentialVaultService.js';

export class CredentialsGetTool {
  readonly id = 'credentialsGet';
  readonly name = 'credentialsGet';
  readonly displayName = 'Retrieve Credential';
  readonly description = 'Retrieve a decrypted credential from the vault by platform and key.';
  readonly category = 'security';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      platform: { type: 'string', description: 'Platform or service name (e.g., "twitter", "openai")' },
      key: { type: 'string', description: 'Credential key (e.g., "apiKey", "accessToken")' },
    },
    required: ['platform', 'key'],
  };

  constructor(private service: CredentialVaultService) {}

  async execute(args: {
    platform: string;
    key: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const value = await this.service.getCredential(args.platform, args.key);
      if (value === null) {
        return {
          success: false,
          error: `Credential not found: ${args.platform}/${args.key}`,
        };
      }
      return {
        success: true,
        data: { platform: args.platform, key: args.key, value },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

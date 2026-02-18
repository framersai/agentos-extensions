import type { CredentialVaultService } from '../CredentialVaultService.js';

export class CredentialsSetTool {
  readonly id = 'credentialsSet';
  readonly name = 'credentialsSet';
  readonly displayName = 'Store Credential';
  readonly description = 'Store an encrypted credential in the vault, scoped by platform and key.';
  readonly category = 'security';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      platform: { type: 'string', description: 'Platform or service name (e.g., "twitter", "openai", "github")' },
      key: { type: 'string', description: 'Credential key (e.g., "apiKey", "accessToken", "password")' },
      value: { type: 'string', description: 'Credential value to encrypt and store' },
    },
    required: ['platform', 'key', 'value'],
  };

  constructor(private service: CredentialVaultService) {}

  async execute(args: {
    platform: string;
    key: string;
    value: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      await this.service.setCredential(args.platform, args.key, args.value);
      return {
        success: true,
        data: {
          platform: args.platform,
          key: args.key,
          message: `Credential stored for ${args.platform}/${args.key}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

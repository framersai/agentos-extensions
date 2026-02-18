import type { CredentialVaultService } from '../CredentialVaultService.js';

export class CredentialsListTool {
  readonly id = 'credentialsList';
  readonly name = 'credentialsList';
  readonly displayName = 'List Credentials';
  readonly description = 'List stored credentials with masked values. Optionally filter by platform.';
  readonly category = 'security';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      platform: { type: 'string', description: 'Optional platform filter to list credentials for a specific service' },
    },
  };

  constructor(private service: CredentialVaultService) {}

  async execute(args: {
    platform?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const credentials = await this.service.listCredentials(args.platform);
      return {
        success: true,
        data: { credentials, count: credentials.length },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

import type { CredentialVaultService } from '../CredentialVaultService.js';

export class CredentialsRotateTool {
  readonly id = 'credentialsRotate';
  readonly name = 'credentialsRotate';
  readonly displayName = 'Rotate Credential';
  readonly description = 'Rotate an existing credential by updating its value and marking rotation timestamp. Useful for OAuth token refresh.';
  readonly category = 'security';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      platform: { type: 'string', description: 'Platform or service name' },
      key: { type: 'string', description: 'Credential key to rotate' },
      refreshToken: { type: 'string', description: 'New credential value or refresh token' },
    },
    required: ['platform', 'key', 'refreshToken'],
  };

  constructor(private service: CredentialVaultService) {}

  async execute(args: {
    platform: string;
    key: string;
    refreshToken: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Verify the credential exists before rotating
      const existing = await this.service.getCredential(args.platform, args.key);
      if (existing === null) {
        return {
          success: false,
          error: `Credential not found: ${args.platform}/${args.key}. Cannot rotate a non-existent credential.`,
        };
      }

      // Store the new value (setCredential preserves createdAt and updates updatedAt)
      await this.service.setCredential(args.platform, args.key, args.refreshToken);

      return {
        success: true,
        data: {
          platform: args.platform,
          key: args.key,
          rotatedAt: new Date().toISOString(),
          message: `Credential rotated for ${args.platform}/${args.key}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

import type { CredentialVaultService } from '../CredentialVaultService.js';

export class CredentialsImportTool {
  readonly id = 'credentialsImport';
  readonly name = 'credentialsImport';
  readonly displayName = 'Import Credentials';
  readonly description = 'Import credentials from JSON array or CSV data into the encrypted vault.';
  readonly category = 'security';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      data: {
        type: 'string',
        description: 'Credential data as JSON array (e.g., [{"platform":"x","key":"apiKey","value":"sk-..."}]) or CSV (platform,key,value per line)',
      },
      format: {
        type: 'string',
        enum: ['json', 'csv'],
        description: 'Data format (default: json)',
      },
    },
    required: ['data'],
  };

  constructor(private service: CredentialVaultService) {}

  async execute(args: {
    data: string;
    format?: 'json' | 'csv';
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.importCredentials(
        args.data,
        args.format ?? 'json',
      );
      return {
        success: true,
        data: {
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors.length > 0 ? result.errors : undefined,
          message: `Imported ${result.imported} credential(s), skipped ${result.skipped}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

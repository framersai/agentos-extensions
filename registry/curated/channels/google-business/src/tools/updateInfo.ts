import type { GoogleBusinessService } from '../GoogleBusinessService.js';

export class GbpUpdateInfoTool {
  readonly id = 'gbpUpdateInfo';
  readonly name = 'gbpUpdateInfo';
  readonly displayName = 'Update Business Info';
  readonly description = 'Update business information on a Google Business Profile location (description, website, phone).';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      locationName: { type: 'string', description: 'Location resource name (e.g. "locations/123")' },
      description: { type: 'string', description: 'Updated business description' },
      websiteUri: { type: 'string', description: 'Updated website URL' },
      primaryPhone: { type: 'string', description: 'Updated primary phone number' },
    },
    required: ['locationName'],
  };

  constructor(private service: GoogleBusinessService) {}

  async execute(args: {
    locationName: string;
    description?: string;
    websiteUri?: string;
    primaryPhone?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const phoneNumbers = args.primaryPhone
        ? { primaryPhone: args.primaryPhone }
        : undefined;

      await this.service.updateBusinessInfo(args.locationName, {
        description: args.description,
        websiteUri: args.websiteUri,
        phoneNumbers,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

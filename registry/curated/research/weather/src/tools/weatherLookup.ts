import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import { WeatherService } from '../services/weatherService.js';
import type { WeatherResult } from '../services/weatherService.js';

export interface WeatherLookupInput {
  location: string;
  days?: number;
}

export class WeatherLookupTool implements ITool<WeatherLookupInput, WeatherResult> {
  readonly id = 'weather-lookup-v1';
  readonly name = 'weather_lookup';
  readonly displayName = 'Weather Lookup';
  readonly description =
    'Get current weather conditions and forecasts for any location. Returns temperature (F/C), humidity, wind, precipitation, UV index, and severe weather alerts.';
  readonly category = 'research';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['location'],
    properties: {
      location: {
        type: 'string',
        description: 'City name, zip code, or lat,lon coordinates (e.g. "Las Vegas", "90210", "36.17,-115.14")',
      },
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 14,
        default: 3,
        description: 'Number of forecast days (1-14, default 3)',
      },
    },
    additionalProperties: false,
  };

  readonly requiredCapabilities = ['capability:web_access'];

  constructor(private readonly service: WeatherService) {}

  async execute(
    args: WeatherLookupInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<WeatherResult>> {
    if (!args.location || args.location.trim().length === 0) {
      return { success: false, error: 'Location is required.' };
    }

    try {
      const result = await this.service.getWeather(args.location.trim(), args.days ?? 3);
      return { success: true, output: result };
    } catch (err: any) {
      return { success: false, error: `Weather lookup failed: ${err.message}` };
    }
  }

  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];
    if (!input.location || typeof input.location !== 'string') {
      errors.push('location is required and must be a string');
    }
    if (input.days !== undefined) {
      if (typeof input.days !== 'number' || input.days < 1 || input.days > 14) {
        errors.push('days must be an integer between 1 and 14');
      }
    }
    return { isValid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Dynamic import after stubbing fetch
const { WeatherService } = await import('../src/services/weatherService.js');
const { WeatherLookupTool } = await import('../src/tools/weatherLookup.js');
const { createExtensionPack } = await import('../src/index.js');

// ── Fixtures ──────────────────────────────────────────────────────────────

const GEOCODE_RESPONSE = {
  results: [
    {
      name: 'Las Vegas',
      admin1: 'Nevada',
      country: 'United States',
      latitude: 36.175,
      longitude: -115.1372,
      timezone: 'America/Los_Angeles',
    },
  ],
};

const WEATHERAPI_RESPONSE = {
  location: {
    name: 'Las Vegas',
    region: 'Nevada',
    country: 'United States of America',
    lat: 36.17,
    lon: -115.14,
    tz_id: 'America/Los_Angeles',
  },
  current: {
    temp_f: 95.0,
    temp_c: 35.0,
    condition: { text: 'Sunny' },
    humidity: 12,
    wind_mph: 8.1,
    wind_dir: 'SW',
    uv: 9.0,
    feelslike_f: 93.0,
  },
  forecast: {
    forecastday: [
      {
        date: '2026-02-23',
        day: {
          maxtemp_f: 97.0,
          mintemp_f: 72.0,
          maxtemp_c: 36.1,
          mintemp_c: 22.2,
          condition: { text: 'Sunny' },
          daily_chance_of_rain: 0,
          maxwind_mph: 12.5,
          uv: 9.0,
        },
      },
    ],
  },
  alerts: { alert: [] },
};

const OPENMETEO_RESPONSE = {
  latitude: 36.175,
  longitude: -115.1372,
  timezone: 'America/Los_Angeles',
  current: {
    temperature_2m: 92.0,
    relative_humidity_2m: 15,
    wind_speed_10m: 7.5,
    wind_direction_10m: 225,
    weather_code: 0,
  },
  daily: {
    time: ['2026-02-23', '2026-02-24', '2026-02-25'],
    weather_code: [0, 1, 3],
    temperature_2m_max: [96.0, 94.0, 90.0],
    temperature_2m_min: [71.0, 70.0, 68.0],
    precipitation_sum: [0, 0, 0.1],
    precipitation_probability_max: [0, 5, 20],
    wind_speed_10m_max: [12.0, 10.0, 15.0],
    uv_index_max: [9.0, 8.5, 7.0],
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('WeatherService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('geocode', () => {
    it('resolves a city name to coordinates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => GEOCODE_RESPONSE,
      });

      const service = new WeatherService();
      const geo = await service.geocode('Las Vegas');

      expect(geo.name).toBe('Las Vegas');
      expect(geo.lat).toBe(36.175);
      expect(geo.lon).toBe(-115.1372);
      expect(geo.region).toBe('Nevada');
    });

    it('throws on empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const service = new WeatherService();
      await expect(service.geocode('xyznonexistent')).rejects.toThrow('Location not found');
    });
  });

  describe('getWeather with WeatherAPI.com', () => {
    it('uses WeatherAPI when key is provided', async () => {
      // geocode call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => GEOCODE_RESPONSE,
      });
      // weatherapi call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => WEATHERAPI_RESPONSE,
      });

      const service = new WeatherService('test-key-123');
      const result = await service.getWeather('Las Vegas', 3);

      expect(result.provider).toBe('weatherapi');
      expect(result.current?.temp_f).toBe(95.0);
      expect(result.current?.condition).toBe('Sunny');
      expect(result.forecast).toHaveLength(1);
      expect(result.forecast[0].max_f).toBe(97.0);
    });

    it('falls back to Open-Meteo when WeatherAPI fails', async () => {
      // geocode call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => GEOCODE_RESPONSE,
      });
      // weatherapi fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });
      // open-meteo call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => OPENMETEO_RESPONSE,
      });

      const service = new WeatherService('bad-key');
      const result = await service.getWeather('Las Vegas', 3);

      expect(result.provider).toBe('open-meteo');
      expect(result.current?.temp_f).toBe(92.0);
      expect(result.forecast).toHaveLength(3);
    });
  });

  describe('getWeather with Open-Meteo fallback', () => {
    it('uses Open-Meteo when no key is provided', async () => {
      // geocode call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => GEOCODE_RESPONSE,
      });
      // open-meteo call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => OPENMETEO_RESPONSE,
      });

      const service = new WeatherService();
      const result = await service.getWeather('Las Vegas', 3);

      expect(result.provider).toBe('open-meteo');
      expect(result.location.name).toBe('Las Vegas');
      expect(result.current?.humidity).toBe(15);
      expect(result.current?.wind_dir).toBe('SW');
      expect(result.forecast).toHaveLength(3);
      expect(result.forecast[0].condition).toBe('Clear sky');
      expect(result.forecast[1].condition).toBe('Mainly clear');
      expect(result.forecast[2].condition).toBe('Overcast');
    });
  });
});

describe('WeatherLookupTool', () => {
  let tool: InstanceType<typeof WeatherLookupTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    const service = new WeatherService('test-key');
    tool = new WeatherLookupTool(service);
  });

  it('has correct metadata', () => {
    expect(tool.id).toBe('weather-lookup-v1');
    expect(tool.name).toBe('weather_lookup');
    expect(tool.category).toBe('research');
    expect(tool.hasSideEffects).toBe(false);
  });

  it('has valid input schema', () => {
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('location');
    expect(tool.inputSchema.properties).toHaveProperty('location');
    expect(tool.inputSchema.properties).toHaveProperty('days');
  });

  it('validates args correctly', () => {
    expect(tool.validateArgs({ location: 'Las Vegas' }).isValid).toBe(true);
    expect(tool.validateArgs({ location: 'NYC', days: 5 }).isValid).toBe(true);
    expect(tool.validateArgs({}).isValid).toBe(false);
    expect(tool.validateArgs({ location: 'NYC', days: 20 }).isValid).toBe(false);
  });

  it('returns error for empty location', async () => {
    const result = await tool.execute({ location: '' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('executes successfully with mocked service', async () => {
    // geocode
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GEOCODE_RESPONSE,
    });
    // weatherapi
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => WEATHERAPI_RESPONSE,
    });

    const result = await tool.execute({ location: 'Las Vegas', days: 3 }, {} as any);
    expect(result.success).toBe(true);
    expect(result.output?.provider).toBe('weatherapi');
    expect(result.output?.location.name).toBe('Las Vegas');
  });
});

describe('createExtensionPack', () => {
  it('creates pack with correct metadata', () => {
    const pack = createExtensionPack({
      options: { weatherApiKey: 'test' },
    } as any);
    expect(pack.name).toBe('@framers/agentos-ext-weather');
    expect(pack.descriptors).toHaveLength(1);
    expect(pack.descriptors[0].id).toBe('weather_lookup');
    expect(pack.descriptors[0].kind).toBe('tool');
  });

  it('works without API key', () => {
    const pack = createExtensionPack({ options: {} } as any);
    expect(pack.descriptors).toHaveLength(1);
  });
});

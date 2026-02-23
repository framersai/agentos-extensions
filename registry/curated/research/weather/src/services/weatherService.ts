/**
 * Dual-provider weather service.
 *
 * Provider priority:
 *   1. WeatherAPI.com — preferred when WEATHERAPI_KEY is configured
 *   2. Open-Meteo     — always-available fallback (no key required)
 *
 * Geocoding is handled by the Open-Meteo Geocoding API (free, no key).
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface GeoLocation {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface CurrentWeather {
  temp_f: number;
  temp_c: number;
  condition: string;
  humidity: number;
  wind_mph: number;
  wind_dir: string;
  uv: number;
  feels_like_f: number;
}

export interface ForecastDay {
  date: string;
  max_f: number;
  min_f: number;
  max_c: number;
  min_c: number;
  condition: string;
  precip_chance: number;
  wind_max_mph: number;
  uv_max: number;
}

export interface WeatherAlert {
  headline: string;
  severity: string;
  description: string;
}

export interface WeatherResult {
  provider: 'weatherapi' | 'open-meteo';
  location: GeoLocation;
  current?: CurrentWeather;
  forecast: ForecastDay[];
  alerts?: WeatherAlert[];
}

// ── WMO weather code → human-readable condition ────────────────────────────

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function wmoToCondition(code: number): string {
  return WMO_CODES[code] ?? `Unknown (${code})`;
}

/** Convert Fahrenheit to Celsius, rounded to 1 decimal. */
function fToC(f: number): number {
  return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

// ── Service ────────────────────────────────────────────────────────────────

export class WeatherService {
  constructor(private readonly weatherApiKey?: string) {}

  get hasWeatherApiKey(): boolean {
    return !!this.weatherApiKey;
  }

  /** Geocode a location string to coordinates via Open-Meteo. */
  async geocode(location: string): Promise<GeoLocation> {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Geocoding failed (${res.status}): ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const results = data.results;
    if (!results || results.length === 0) {
      throw new Error(`Location not found: "${location}"`);
    }

    const r = results[0];
    return {
      name: r.name,
      region: r.admin1 ?? '',
      country: r.country ?? '',
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone ?? 'UTC',
    };
  }

  /** Main entry: get weather for a location string. */
  async getWeather(location: string, days: number = 3): Promise<WeatherResult> {
    const geo = await this.geocode(location);

    // Try WeatherAPI.com first if key is available
    if (this.weatherApiKey) {
      try {
        return await this.fetchWeatherApi(geo, days);
      } catch {
        // Fall through to Open-Meteo
      }
    }

    return this.fetchOpenMeteo(geo, days);
  }

  // ── WeatherAPI.com ─────────────────────────────────────────────────────

  private async fetchWeatherApi(geo: GeoLocation, days: number): Promise<WeatherResult> {
    const clampedDays = Math.min(days, 3); // free tier = 3 days max
    const q = `${geo.lat},${geo.lon}`;
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.weatherApiKey}&q=${q}&days=${clampedDays}&aqi=no&alerts=yes`;

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WeatherAPI error (${res.status}): ${body}`);
    }

    const data = (await res.json()) as any;
    const loc = data.location ?? {};
    const cur = data.current ?? {};
    const forecastDays: ForecastDay[] = (data.forecast?.forecastday ?? []).map((fd: any) => ({
      date: fd.date,
      max_f: fd.day?.maxtemp_f ?? 0,
      min_f: fd.day?.mintemp_f ?? 0,
      max_c: fd.day?.maxtemp_c ?? 0,
      min_c: fd.day?.mintemp_c ?? 0,
      condition: fd.day?.condition?.text ?? 'Unknown',
      precip_chance: fd.day?.daily_chance_of_rain ?? 0,
      wind_max_mph: fd.day?.maxwind_mph ?? 0,
      uv_max: fd.day?.uv ?? 0,
    }));

    const alerts: WeatherAlert[] = (data.alerts?.alert ?? []).map((a: any) => ({
      headline: a.headline ?? '',
      severity: a.severity ?? '',
      description: a.desc ?? a.event ?? '',
    }));

    return {
      provider: 'weatherapi',
      location: {
        name: loc.name ?? geo.name,
        region: loc.region ?? geo.region,
        country: loc.country ?? geo.country,
        lat: loc.lat ?? geo.lat,
        lon: loc.lon ?? geo.lon,
        timezone: loc.tz_id ?? geo.timezone,
      },
      current: {
        temp_f: cur.temp_f ?? 0,
        temp_c: cur.temp_c ?? 0,
        condition: cur.condition?.text ?? 'Unknown',
        humidity: cur.humidity ?? 0,
        wind_mph: cur.wind_mph ?? 0,
        wind_dir: cur.wind_dir ?? '',
        uv: cur.uv ?? 0,
        feels_like_f: cur.feelslike_f ?? 0,
      },
      forecast: forecastDays,
      alerts: alerts.length > 0 ? alerts : undefined,
    };
  }

  // ── Open-Meteo ─────────────────────────────────────────────────────────

  private async fetchOpenMeteo(geo: GeoLocation, days: number): Promise<WeatherResult> {
    const clampedDays = Math.min(days, 16);
    const hourlyVars = 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation_probability,weather_code';
    const dailyVars = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max';
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&hourly=${hourlyVars}` +
      `&daily=${dailyVars}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code` +
      `&temperature_unit=fahrenheit` +
      `&wind_speed_unit=mph` +
      `&timezone=auto` +
      `&forecast_days=${clampedDays}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo error (${res.status}): ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const cur = data.current ?? {};
    const daily = data.daily ?? {};

    const forecastDays: ForecastDay[] = [];
    const dates: string[] = daily.time ?? [];
    for (let i = 0; i < dates.length; i++) {
      const maxF = daily.temperature_2m_max?.[i] ?? 0;
      const minF = daily.temperature_2m_min?.[i] ?? 0;
      forecastDays.push({
        date: dates[i],
        max_f: maxF,
        min_f: minF,
        max_c: fToC(maxF),
        min_c: fToC(minF),
        condition: wmoToCondition(daily.weather_code?.[i] ?? 0),
        precip_chance: daily.precipitation_probability_max?.[i] ?? 0,
        wind_max_mph: daily.wind_speed_10m_max?.[i] ?? 0,
        uv_max: daily.uv_index_max?.[i] ?? 0,
      });
    }

    const tempF = cur.temperature_2m ?? 0;
    const windDir = cur.wind_direction_10m ?? 0;
    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const windDirStr = cardinals[Math.round(windDir / 22.5) % 16];

    return {
      provider: 'open-meteo',
      location: geo,
      current: {
        temp_f: tempF,
        temp_c: fToC(tempF),
        condition: wmoToCondition(cur.weather_code ?? 0),
        humidity: cur.relative_humidity_2m ?? 0,
        wind_mph: cur.wind_speed_10m ?? 0,
        wind_dir: windDirStr,
        uv: forecastDays[0]?.uv_max ?? 0,
        feels_like_f: tempF, // Open-Meteo free doesn't provide feels-like
      },
      forecast: forecastDays,
    };
  }
}

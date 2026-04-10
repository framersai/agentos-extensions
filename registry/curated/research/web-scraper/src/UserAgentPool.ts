// @ts-nocheck
/**
 * User Agent Pool — Programmatic generator for realistic browser User-Agent
 * strings and accompanying HTTP headers.
 *
 * Rather than maintaining a static list that goes stale, this module
 * constructs UA strings on the fly by combining browser families, version
 * ranges, OS platforms, and engine version strings that mirror real-world
 * distributions.  The result is a virtually unlimited set of unique yet
 * plausible UAs, greatly reducing the fingerprinting surface when scraping.
 *
 * @module UserAgentPool
 */

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Return a random integer in the range [min, max] (inclusive on both ends).
 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a random element from a non-empty array.
 */
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]!;
}

/* -------------------------------------------------------------------------- */
/*  Version ranges — kept tight to match real-world recent releases           */
/* -------------------------------------------------------------------------- */

/** Chrome major version range (roughly Q3 2024 – Q1 2026). */
const CHROME_MIN = 128;
const CHROME_MAX = 133;

/** Firefox major version range (roughly Q3 2024 – Q1 2026). */
const FIREFOX_MIN = 130;
const FIREFOX_MAX = 135;

/** Safari major version range (17.x and 18.x cover macOS Sonoma+Sequoia). */
const SAFARI_MAJOR_MIN = 17;
const SAFARI_MAJOR_MAX = 18;

/** Edge major version range (tracks Chromium, slight lag). */
const EDGE_MIN = 128;
const EDGE_MAX = 131;

/* -------------------------------------------------------------------------- */
/*  OS platform strings                                                       */
/* -------------------------------------------------------------------------- */

/** Windows platform tokens. */
const WINDOWS_PLATFORMS = [
  'Windows NT 10.0; Win64; x64',       // Windows 10 / 11
  'Windows NT 10.0; WOW64',            // Windows 10 32-on-64
] as const;

/** macOS platform tokens with realistic Darwin/macOS version combos. */
const MACOS_PLATFORMS = [
  'Macintosh; Intel Mac OS X 10_15_7',  // Catalina (still common)
  'Macintosh; Intel Mac OS X 13_6_7',   // Ventura
  'Macintosh; Intel Mac OS X 14_5',     // Sonoma
  'Macintosh; Intel Mac OS X 14_7_4',   // Sonoma point release
  'Macintosh; Intel Mac OS X 15_3_2',   // Sequoia
] as const;

/** Linux platform tokens. */
const LINUX_PLATFORMS = [
  'X11; Linux x86_64',
  'X11; Ubuntu; Linux x86_64',
] as const;

/**
 * All platform strings grouped so the generator can weight them
 * roughly matching real browser market share.
 */
const ALL_PLATFORMS = [
  ...WINDOWS_PLATFORMS,
  ...WINDOWS_PLATFORMS,   // double-weight — Windows has ~60% desktop share
  ...MACOS_PLATFORMS,
  ...LINUX_PLATFORMS,
] as const;

/* -------------------------------------------------------------------------- */
/*  Engine version builders                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Generate a realistic AppleWebKit version string.
 * Safari (and Chromium on macOS) ships WebKit 605.1.15 for ages, but the
 * Safari version suffix changes.
 */
function webkitVersion(): string {
  return '605.1.15';
}

/**
 * Generate a Gecko/Firefox version string.
 * The Gecko date token is always "20100101" in modern Firefox.
 */
function geckoDateToken(): string {
  return '20100101';
}

/* -------------------------------------------------------------------------- */
/*  Per-browser UA builders                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build a Chrome-style UA.
 *
 * @example
 * Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
 *   (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
 */
function buildChromeUA(): string {
  const major = randInt(CHROME_MIN, CHROME_MAX);
  const platform = pick(ALL_PLATFORMS);
  // Chrome minor/build/patch are almost always 0.0.0 in public UAs
  return (
    `Mozilla/5.0 (${platform}) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  );
}

/**
 * Build a Firefox-style UA.
 *
 * @example
 * Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0
 */
function buildFirefoxUA(): string {
  const major = randInt(FIREFOX_MIN, FIREFOX_MAX);
  const platform = pick(ALL_PLATFORMS);
  return (
    `Mozilla/5.0 (${platform}; rv:${major}.0) ` +
    `Gecko/${geckoDateToken()} Firefox/${major}.0`
  );
}

/**
 * Build a Safari-style UA (macOS only).
 *
 * @example
 * Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15
 *   (KHTML, like Gecko) Version/18.1 Safari/605.1.15
 */
function buildSafariUA(): string {
  const major = randInt(SAFARI_MAJOR_MIN, SAFARI_MAJOR_MAX);
  const minor = randInt(0, 4);
  const platform = pick(MACOS_PLATFORMS);
  const wk = webkitVersion();
  return (
    `Mozilla/5.0 (${platform}) AppleWebKit/${wk} ` +
    `(KHTML, like Gecko) Version/${major}.${minor} Safari/${wk}`
  );
}

/**
 * Build an Edge-style UA (Chromium-based).
 *
 * @example
 * Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
 *   (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0
 */
function buildEdgeUA(): string {
  const major = randInt(EDGE_MIN, EDGE_MAX);
  // Edge's Chromium version typically matches its own major
  const platform = pick([...WINDOWS_PLATFORMS, ...MACOS_PLATFORMS]);
  return (
    `Mozilla/5.0 (${platform}) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`
  );
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * UA builder lookup.  Weights approximate real-world desktop market share:
 *   Chrome ~65%, Firefox ~5%, Safari ~20%, Edge ~10%
 */
const UA_BUILDERS: Array<() => string> = [
  // Chrome — 13 entries (~65%)
  buildChromeUA, buildChromeUA, buildChromeUA, buildChromeUA,
  buildChromeUA, buildChromeUA, buildChromeUA, buildChromeUA,
  buildChromeUA, buildChromeUA, buildChromeUA, buildChromeUA,
  buildChromeUA,
  // Safari — 4 entries (~20%)
  buildSafariUA, buildSafariUA, buildSafariUA, buildSafariUA,
  // Edge — 2 entries (~10%)
  buildEdgeUA, buildEdgeUA,
  // Firefox — 1 entry (~5%)
  buildFirefoxUA,
];

/**
 * Generate a random, realistic desktop browser User-Agent string.
 *
 * The UA is constructed programmatically from current browser version
 * ranges, OS tokens, and engine strings — no static list required.
 * Distribution roughly mirrors real-world desktop browser market share.
 *
 * @returns A full User-Agent header value.
 *
 * @example
 * ```ts
 * const ua = randomUserAgent();
 * // "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."
 * ```
 */
export function randomUserAgent(): string {
  return pick(UA_BUILDERS)();
}

/**
 * Generate a complete set of realistic browser-like HTTP headers.
 *
 * These headers mimic what a real browser sends on every navigation
 * request, reducing the likelihood of bot-detection based on missing
 * or anomalous headers.
 *
 * @param ua - Optional User-Agent override. When omitted a fresh
 *             random UA is generated via {@link randomUserAgent}.
 * @returns A header record suitable for `fetch()` or Playwright's
 *          `page.setExtraHTTPHeaders()`.
 *
 * @example
 * ```ts
 * const headers = browserHeaders();
 * const res = await fetch(url, { headers });
 * ```
 */
export function browserHeaders(ua?: string): Record<string, string> {
  const userAgent = ua ?? randomUserAgent();

  // Determine browser family from the UA to set matching Sec-CH-UA hints
  const isFirefox = userAgent.includes('Firefox/');
  const isEdge = userAgent.includes('Edg/');
  const isSafari = !isFirefox && !isEdge && userAgent.includes('Version/') && userAgent.includes('Safari/');

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': pick([
      'en-US,en;q=0.9',
      'en-US,en;q=0.9,es;q=0.8',
      'en-GB,en;q=0.9,en-US;q=0.8',
      'en-US,en;q=0.9,de;q=0.8',
      'en-US,en;q=0.9,fr;q=0.8',
    ]),
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': pick(['max-age=0', 'no-cache']),
  };

  // Sec-Fetch-* headers — Firefox and Safari omit some of these
  if (!isFirefox && !isSafari) {
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = pick(['none', 'same-origin', 'cross-site']);
    headers['Sec-Fetch-User'] = '?1';
  }

  // Chromium-based browsers send Sec-CH-UA client hints
  if (!isFirefox && !isSafari) {
    // Extract major version from Chrome/xxx or Edg/xxx
    const versionMatch = userAgent.match(/(?:Chrome|Edg)\/(\d+)/);
    const majorVersion = versionMatch ? versionMatch[1] : '131';

    if (isEdge) {
      headers['Sec-CH-UA'] =
        `"Microsoft Edge";v="${majorVersion}", "Chromium";v="${majorVersion}", "Not A(Brand";v="99"`;
    } else {
      headers['Sec-CH-UA'] =
        `"Google Chrome";v="${majorVersion}", "Chromium";v="${majorVersion}", "Not A(Brand";v="99"`;
    }

    headers['Sec-CH-UA-Mobile'] = '?0';

    // Set platform hint based on OS in UA
    if (userAgent.includes('Macintosh')) {
      headers['Sec-CH-UA-Platform'] = '"macOS"';
    } else if (userAgent.includes('Linux')) {
      headers['Sec-CH-UA-Platform'] = '"Linux"';
    } else {
      headers['Sec-CH-UA-Platform'] = '"Windows"';
    }
  }

  return headers;
}

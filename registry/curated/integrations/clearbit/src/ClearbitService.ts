// @ts-nocheck
/**
 * ClearbitService — thin wrapper around the Clearbit Enrichment REST API.
 *
 * Handles authentication, request construction, and response normalization
 * for the Company and Person enrichment endpoints.
 *
 * @example
 * ```ts
 * const svc = new ClearbitService('sk_...');
 * const company = await svc.company('stripe.com');
 * const person  = await svc.person('jane@stripe.com');
 * ```
 */

/** Enriched company data returned by the Clearbit Company API. */
export interface ClearbitCompany {
  /** Legal / brand name of the company. */
  name: string | null;
  /** Primary web domain. */
  domain: string | null;
  /** Short company description. */
  description: string | null;
  /** Primary industry classification. */
  industry: string | null;
  /** Broader sector classification. */
  sector: string | null;
  /** Freeform tags applied by Clearbit. */
  tags: string[];
  /** Notable technologies detected on the domain. */
  techUsed: string[];
  /** Approximate number of employees. */
  employeeCount: number | null;
  /** Estimated annual revenue in USD. */
  annualRevenue: number | null;
  /** Year the company was founded. */
  foundedYear: number | null;
  /** Headquarters location string. */
  location: string | null;
  /** Links to company social-media profiles. */
  socialProfiles: {
    linkedin: string | null;
    twitter: string | null;
    facebook: string | null;
    crunchbase: string | null;
  };
  /** URL of the company logo image. */
  logo: string | null;
}

/** Enriched person data returned by the Clearbit Person API. */
export interface ClearbitPerson {
  /** Full display name. */
  fullName: string | null;
  /** Email address used for the lookup. */
  email: string | null;
  /** Functional role (e.g. "engineering", "sales"). */
  role: string | null;
  /** Job title. */
  title: string | null;
  /** Seniority level (e.g. "executive", "manager"). */
  seniority: string | null;
  /** Basic company information associated with this person. */
  company: {
    name: string | null;
    domain: string | null;
    industry: string | null;
  };
  /** Links to personal social-media profiles. */
  socialProfiles: {
    linkedin: string | null;
    twitter: string | null;
    github: string | null;
  };
  /** URL of the person's avatar image. */
  avatar: string | null;
  /** Geographic location string. */
  location: string | null;
  /** Short biography. */
  bio: string | null;
}

/**
 * Low-level client for Clearbit's Company and Person enrichment APIs.
 *
 * All network errors and non-success status codes are translated into
 * typed return values (`null` for 404 "not found", thrown `Error` for
 * everything else) so callers never need to inspect raw HTTP responses.
 */
export class ClearbitService {
  /** Base URL for the Company enrichment endpoint. */
  private static readonly COMPANY_BASE = 'https://company.clearbit.com/v2/companies/find';
  /** Base URL for the Person enrichment endpoint. */
  private static readonly PERSON_BASE = 'https://person.clearbit.com/v2/people/find';

  /** The Clearbit secret API key used for Bearer auth. */
  private readonly apiKey: string;

  /**
   * Create a new ClearbitService instance.
   *
   * @param apiKey - Clearbit API key. Falls back to `CLEARBIT_API_KEY` env var.
   */
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CLEARBIT_API_KEY || '';
  }

  /**
   * Enrich a company by its web domain.
   *
   * @param domain - The company domain to look up (e.g. `"stripe.com"`).
   * @returns The enriched company record, or `null` if the domain was not found.
   * @throws {Error} On network failures, invalid input (422), or unexpected API errors.
   */
  async company(domain: string): Promise<ClearbitCompany | null> {
    const url = `${ClearbitService.COMPANY_BASE}?domain=${encodeURIComponent(domain)}`;
    const response = await this.request(url);

    if (response === null) {
      return null;
    }

    const d = response as any;
    return {
      name: d.name ?? null,
      domain: d.domain ?? null,
      description: d.description ?? null,
      industry: d.category?.industry ?? null,
      sector: d.category?.sector ?? null,
      tags: Array.isArray(d.tags) ? d.tags : [],
      techUsed: Array.isArray(d.tech) ? d.tech : [],
      employeeCount: d.metrics?.employees ?? null,
      annualRevenue: d.metrics?.estimatedAnnualRevenue
        ? this.parseRevenue(d.metrics.estimatedAnnualRevenue)
        : null,
      foundedYear: d.foundedYear ?? null,
      location: d.geo ? [d.geo.city, d.geo.stateCode, d.geo.country].filter(Boolean).join(', ') : null,
      socialProfiles: {
        linkedin: d.linkedin?.handle ? `https://linkedin.com/company/${d.linkedin.handle}` : null,
        twitter: d.twitter?.handle ? `https://twitter.com/${d.twitter.handle}` : null,
        facebook: d.facebook?.handle ? `https://facebook.com/${d.facebook.handle}` : null,
        crunchbase: d.crunchbase?.handle ? `https://crunchbase.com/organization/${d.crunchbase.handle}` : null,
      },
      logo: d.logo ?? null,
    };
  }

  /**
   * Enrich a person by their email address.
   *
   * @param email - The email address to look up.
   * @returns The enriched person record, or `null` if the email was not found.
   * @throws {Error} On network failures, invalid input (422), or unexpected API errors.
   */
  async person(email: string): Promise<ClearbitPerson | null> {
    const url = `${ClearbitService.PERSON_BASE}?email=${encodeURIComponent(email)}`;
    const response = await this.request(url);

    if (response === null) {
      return null;
    }

    const d = response as any;
    return {
      fullName: d.name?.fullName ?? null,
      email: d.email ?? null,
      role: d.employment?.role ?? null,
      title: d.employment?.title ?? null,
      seniority: d.employment?.seniority ?? null,
      company: {
        name: d.employment?.name ?? null,
        domain: d.employment?.domain ?? null,
        industry: d.employment?.industry ?? null,
      },
      socialProfiles: {
        linkedin: d.linkedin?.handle ? `https://linkedin.com/in/${d.linkedin.handle}` : null,
        twitter: d.twitter?.handle ? `https://twitter.com/${d.twitter.handle}` : null,
        github: d.github?.handle ? `https://github.com/${d.github.handle}` : null,
      },
      avatar: d.avatar ?? null,
      location: d.geo ? [d.geo.city, d.geo.stateCode, d.geo.country].filter(Boolean).join(', ') : null,
      bio: d.bio ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Execute an authenticated GET request against the Clearbit API.
   *
   * @param url - Fully-qualified request URL.
   * @returns Parsed JSON body, or `null` when the resource was not found (404).
   * @throws {Error} On 422 (invalid input) or any other non-2xx response.
   */
  private async request(url: string): Promise<unknown | null> {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 404) {
      return null;
    }

    if (res.status === 422) {
      const body = await res.text();
      throw new Error(`Clearbit rejected the input (422): ${body}`);
    }

    if (!res.ok) {
      throw new Error(`Clearbit API error (${res.status}): ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Attempt to parse a revenue string like `"$1M-$10M"` into a numeric midpoint.
   *
   * @param raw - Raw revenue string from the API.
   * @returns Numeric estimate in USD, or `null` if unparseable.
   */
  private parseRevenue(raw: string | null): number | null {
    if (!raw || typeof raw !== 'string') return null;
    const nums = raw.replace(/[^0-9.MBK-]/gi, '');
    const multiplier = (s: string): number => {
      if (/B/i.test(s)) return 1_000_000_000;
      if (/M/i.test(s)) return 1_000_000;
      if (/K/i.test(s)) return 1_000;
      return 1;
    };
    const parts = nums.split('-').map((p) => {
      const n = parseFloat(p.replace(/[BMK]/gi, ''));
      return isNaN(n) ? 0 : n * multiplier(p);
    });
    if (parts.length === 0 || parts.every((p) => p === 0)) return null;
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }
}

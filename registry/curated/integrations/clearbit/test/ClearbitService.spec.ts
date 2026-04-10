// @ts-nocheck
/**
 * ClearbitService — Unit Tests
 *
 * Verifies the Clearbit API wrapper's company and person enrichment methods,
 * including successful response parsing, 404 (not found) handling, and
 * Bearer authentication header transmission.
 *
 * All HTTP calls are mocked via `globalThis.fetch` — no real Clearbit API
 * requests are made.
 *
 * @module test/ClearbitService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClearbitService } from '../src/ClearbitService.js';

/* -------------------------------------------------------------------------- */
/*  Global fetch mock                                                         */
/* -------------------------------------------------------------------------- */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mock raw Clearbit Company API response matching their actual JSON shape.
 */
const MOCK_COMPANY_RESPONSE = {
  name: 'Stripe',
  domain: 'stripe.com',
  description: 'Financial infrastructure for the internet.',
  category: {
    industry: 'Financial Services',
    sector: 'Technology',
  },
  tags: ['payments', 'fintech', 'saas'],
  tech: ['react', 'go', 'ruby'],
  metrics: {
    employees: 7000,
    estimatedAnnualRevenue: '$1B-$10B',
  },
  foundedYear: 2010,
  geo: {
    city: 'San Francisco',
    stateCode: 'CA',
    country: 'US',
  },
  linkedin: { handle: 'stripe' },
  twitter: { handle: 'stripe' },
  facebook: { handle: 'StripeHQ' },
  crunchbase: { handle: 'stripe' },
  logo: 'https://logo.clearbit.com/stripe.com',
};

/**
 * Mock raw Clearbit Person API response matching their actual JSON shape.
 */
const MOCK_PERSON_RESPONSE = {
  name: { fullName: 'Jane Doe' },
  email: 'jane@stripe.com',
  employment: {
    role: 'engineering',
    title: 'Staff Engineer',
    seniority: 'senior',
    name: 'Stripe',
    domain: 'stripe.com',
    industry: 'Financial Services',
  },
  linkedin: { handle: 'janedoe' },
  twitter: { handle: 'janedoe' },
  github: { handle: 'janedoe' },
  avatar: 'https://avatar.clearbit.com/jane.jpg',
  geo: {
    city: 'New York',
    stateCode: 'NY',
    country: 'US',
  },
  bio: 'Software engineer passionate about distributed systems.',
};

/* -------------------------------------------------------------------------- */
/*  company()                                                                 */
/* -------------------------------------------------------------------------- */

describe('ClearbitService.company()', () => {
  const svc = new ClearbitService('sk_test_clearbit_key');

  it('should return enriched company data with mocked fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_COMPANY_RESPONSE,
    });

    const company = await svc.company('stripe.com');

    expect(company).not.toBeNull();
    expect(company!.name).toBe('Stripe');
    expect(company!.domain).toBe('stripe.com');
    expect(company!.description).toBe('Financial infrastructure for the internet.');
    expect(company!.industry).toBe('Financial Services');
    expect(company!.sector).toBe('Technology');
    expect(company!.tags).toEqual(['payments', 'fintech', 'saas']);
    expect(company!.techUsed).toEqual(['react', 'go', 'ruby']);
    expect(company!.employeeCount).toBe(7000);
    expect(company!.annualRevenue).toBeGreaterThan(0);
    expect(company!.foundedYear).toBe(2010);
    expect(company!.location).toBe('San Francisco, CA, US');
    expect(company!.socialProfiles.linkedin).toContain('stripe');
    expect(company!.socialProfiles.twitter).toContain('stripe');
    expect(company!.socialProfiles.facebook).toContain('StripeHQ');
    expect(company!.socialProfiles.crunchbase).toContain('stripe');
    expect(company!.logo).toBe('https://logo.clearbit.com/stripe.com');
  });

  it('should return null when the company is not found (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const company = await svc.company('nonexistent-domain-xyz.test');

    expect(company).toBeNull();
  });

  it('should throw on 422 (invalid input)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => 'Invalid domain format',
    });

    await expect(svc.company('not-a-domain'))
      .rejects.toThrow('Clearbit rejected the input (422)');
  });

  it('should throw on unexpected API errors (e.g. 500)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(svc.company('stripe.com'))
      .rejects.toThrow('Clearbit API error (500)');
  });

  it('should handle missing optional fields gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'MinimalCorp',
        domain: 'minimal.test',
        // Everything else is absent
      }),
    });

    const company = await svc.company('minimal.test');

    expect(company).not.toBeNull();
    expect(company!.name).toBe('MinimalCorp');
    expect(company!.description).toBeNull();
    expect(company!.industry).toBeNull();
    expect(company!.tags).toEqual([]);
    expect(company!.techUsed).toEqual([]);
    expect(company!.employeeCount).toBeNull();
    expect(company!.annualRevenue).toBeNull();
    expect(company!.foundedYear).toBeNull();
    expect(company!.location).toBeNull();
    expect(company!.socialProfiles.linkedin).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  person()                                                                  */
/* -------------------------------------------------------------------------- */

describe('ClearbitService.person()', () => {
  const svc = new ClearbitService('sk_test_clearbit_key');

  it('should return enriched person data with mocked fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_PERSON_RESPONSE,
    });

    const person = await svc.person('jane@stripe.com');

    expect(person).not.toBeNull();
    expect(person!.fullName).toBe('Jane Doe');
    expect(person!.email).toBe('jane@stripe.com');
    expect(person!.role).toBe('engineering');
    expect(person!.title).toBe('Staff Engineer');
    expect(person!.seniority).toBe('senior');
    expect(person!.company.name).toBe('Stripe');
    expect(person!.company.domain).toBe('stripe.com');
    expect(person!.company.industry).toBe('Financial Services');
    expect(person!.socialProfiles.linkedin).toContain('janedoe');
    expect(person!.socialProfiles.twitter).toContain('janedoe');
    expect(person!.socialProfiles.github).toContain('janedoe');
    expect(person!.avatar).toBe('https://avatar.clearbit.com/jane.jpg');
    expect(person!.location).toBe('New York, NY, US');
    expect(person!.bio).toContain('distributed systems');
  });

  it('should return null when the person is not found (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const person = await svc.person('nobody@nonexistent.test');

    expect(person).toBeNull();
  });

  it('should throw on 422 (invalid input)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => 'Invalid email format',
    });

    await expect(svc.person('not-an-email'))
      .rejects.toThrow('Clearbit rejected the input (422)');
  });

  it('should handle missing optional fields gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        name: { fullName: 'Minimal Person' },
        email: 'minimal@test.com',
        // Everything else is absent
      }),
    });

    const person = await svc.person('minimal@test.com');

    expect(person).not.toBeNull();
    expect(person!.fullName).toBe('Minimal Person');
    expect(person!.email).toBe('minimal@test.com');
    expect(person!.role).toBeNull();
    expect(person!.title).toBeNull();
    expect(person!.seniority).toBeNull();
    expect(person!.company.name).toBeNull();
    expect(person!.socialProfiles.linkedin).toBeNull();
    expect(person!.avatar).toBeNull();
    expect(person!.bio).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Bearer auth header                                                        */
/* -------------------------------------------------------------------------- */

describe('ClearbitService — authentication', () => {
  it('should send Bearer auth header with the API key', async () => {
    const apiKey = 'sk_super_secret_key';
    const svc = new ClearbitService(apiKey);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_COMPANY_RESPONSE,
    });

    await svc.company('stripe.com');

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [, fetchOptions] = mockFetch.mock.calls[0]!;
    expect(fetchOptions.headers).toBeDefined();
    expect(fetchOptions.headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(fetchOptions.headers.Accept).toBe('application/json');
  });

  it('should include the correct URL with encoded domain', async () => {
    const svc = new ClearbitService('sk_test');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_COMPANY_RESPONSE,
    });

    await svc.company('stripe.com');

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('company.clearbit.com');
    expect(calledUrl).toContain('domain=stripe.com');
  });

  it('should include the correct URL with encoded email for person lookup', async () => {
    const svc = new ClearbitService('sk_test');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_PERSON_RESPONSE,
    });

    await svc.person('jane@stripe.com');

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('person.clearbit.com');
    expect(calledUrl).toContain('email=jane%40stripe.com');
  });
});

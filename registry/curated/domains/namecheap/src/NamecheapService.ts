/**
 * @fileoverview Namecheap XML API service layer.
 *
 * Wraps the Namecheap API for domain search, registration, listing,
 * and DNS record management. All requests use GET with query parameters
 * and return XML responses.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NamecheapConfig {
  /** Namecheap API user (the username used for API authentication) */
  apiUser: string;
  /** Namecheap API key */
  apiKey: string;
  /** Namecheap username (defaults to apiUser if omitted) */
  userName?: string;
  /** Client IP address — must be whitelisted in Namecheap dashboard */
  clientIp: string;
  /** Use sandbox environment for testing (default: false) */
  useSandbox?: boolean;
  /** API base URL override (takes precedence over useSandbox) */
  baseUrl?: string;
}

export interface DomainAvailability {
  domain: string;
  available: boolean;
  isPremiumName: boolean;
  premiumRegistrationPrice?: string;
}

export interface OwnedDomain {
  id: string;
  name: string;
  user: string;
  created: string;
  expires: string;
  isExpired: boolean;
  isLocked: boolean;
  autoRenew: boolean;
  whoisGuard: string;
  nameservers: string;
}

export interface DnsRecord {
  hostId: string;
  name: string;
  type: string;
  address: string;
  mxPref: string;
  ttl: string;
  associatedAppTitle?: string;
  friendlyName?: string;
  isActive: boolean;
  isDDNSEnabled: boolean;
}

export interface DnsHostEntry {
  /** Hostname (e.g. "@", "www", "mail") */
  hostName: string;
  /** Record type: A, AAAA, CNAME, MX, TXT, URL, URL301, FRAME */
  recordType: string;
  /** Address / value for the record */
  address: string;
  /** MX preference (required for MX records, default "10") */
  mxPref?: string;
  /** TTL in seconds (default "1800") */
  ttl?: string;
}

export interface RegisterDomainOptions {
  /** The domain to register (e.g. "example.com") */
  domainName: string;
  /** Number of years to register (1-10, default 1) */
  years?: number;
  /** Registrant contact info */
  registrant: ContactInfo;
  /** Tech contact (defaults to registrant) */
  tech?: ContactInfo;
  /** Admin contact (defaults to registrant) */
  admin?: ContactInfo;
  /** AuxBilling contact (defaults to registrant) */
  auxBilling?: ContactInfo;
  /** Enable WhoisGuard privacy (default: true) */
  addFreeWhoisguard?: boolean;
  /** Enable WhoisGuard (default: true) */
  wgEnabled?: boolean;
  /** Nameservers (comma-separated, uses Namecheap defaults if omitted) */
  nameservers?: string;
}

export interface ContactInfo {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  phone: string;
  emailAddress: string;
  organizationName?: string;
  address2?: string;
  stateProvinceChoice?: string;
}

export interface RegisterDomainResult {
  domain: string;
  registered: boolean;
  chargedAmount: string;
  domainId: string;
  orderId: string;
  transactionId: string;
  whoisguardEnabled: boolean;
  nonRealTimeDomain: boolean;
}

// ---------------------------------------------------------------------------
// Minimal XML Parser (regex-based, no external deps)
// ---------------------------------------------------------------------------

/**
 * Extract the value of a named attribute from an XML element string.
 * e.g. extractAttr('<Domain Name="foo" Available="true" />', 'Available') => 'true'
 */
function extractAttr(element: string, attr: string): string {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const m = element.match(re);
  return m ? m[1] : '';
}

/**
 * Find all occurrences of a self-closing or paired XML tag and return their raw strings.
 */
function findElements(xml: string, tagName: string): string[] {
  // Match self-closing: <Tag ... />
  const selfClosing = new RegExp(`<${tagName}\\b[^>]*/\\s*>`, 'gi');
  // Match paired: <Tag ...>...</Tag>
  const paired = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi');

  const results: string[] = [];
  let m: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((m = selfClosing.exec(xml)) !== null) results.push(m[0]);
  // eslint-disable-next-line no-cond-assign
  while ((m = paired.exec(xml)) !== null) results.push(m[0]);

  return results;
}

/**
 * Extract the inner text content of a paired tag.
 */
function extractInnerText(xml: string, tagName: string): string {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Check if the CommandResponse indicates an error.
 * Returns null if OK, or an error message if errors are present.
 */
function checkApiErrors(xml: string): string | null {
  // Check Status attribute on ApiResponse
  const statusMatch = xml.match(/Status="([^"]*)"/i);
  const status = statusMatch ? statusMatch[1] : '';

  if (status.toLowerCase() === 'error') {
    const errors = findElements(xml, 'Error');
    if (errors.length > 0) {
      const messages = errors.map(e => {
        const num = extractAttr(e, 'Number');
        const text = e.replace(/<[^>]*>/g, '').trim();
        return num ? `[${num}] ${text}` : text;
      });
      return messages.join('; ');
    }
    return 'Unknown Namecheap API error';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const SANDBOX_URL = 'https://api.sandbox.namecheap.com/xml.response';
const PRODUCTION_URL = 'https://api.namecheap.com/xml.response';

export class NamecheapService {
  private config: NamecheapConfig;
  private running = false;

  constructor(config: NamecheapConfig) {
    this.config = {
      ...config,
      userName: config.userName ?? config.apiUser,
      baseUrl: config.baseUrl ?? (config.useSandbox ? SANDBOX_URL : PRODUCTION_URL),
    };
  }

  async initialize(): Promise<void> {
    // Validate credentials by listing domains (lightweight call)
    await this.listDomains(1);
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Domain Search ───────────────────────────────────────────────────────

  /** Check availability of one or more domains (comma-separated). */
  async checkAvailability(domainList: string): Promise<DomainAvailability[]> {
    const xml = await this.apiCall('namecheap.domains.check', {
      DomainList: domainList,
    });

    const elements = findElements(xml, 'DomainCheckResult');
    return elements.map(el => ({
      domain: extractAttr(el, 'Domain'),
      available: extractAttr(el, 'Available').toLowerCase() === 'true',
      isPremiumName: extractAttr(el, 'IsPremiumName').toLowerCase() === 'true',
      premiumRegistrationPrice: extractAttr(el, 'PremiumRegistrationPrice') || undefined,
    }));
  }

  // ── Domain Registration ─────────────────────────────────────────────────

  /** Register/purchase a domain. */
  async registerDomain(opts: RegisterDomainOptions): Promise<RegisterDomainResult> {
    const params: Record<string, string> = {
      DomainName: opts.domainName,
      Years: String(opts.years ?? 1),
      AddFreeWhoisguard: opts.addFreeWhoisguard !== false ? 'yes' : 'no',
      WGEnabled: opts.wgEnabled !== false ? 'yes' : 'no',
    };

    if (opts.nameservers) {
      params.Nameservers = opts.nameservers;
    }

    // Add contact info for all 4 contact types
    const contacts: Array<{ prefix: string; info: ContactInfo }> = [
      { prefix: 'Registrant', info: opts.registrant },
      { prefix: 'Tech', info: opts.tech ?? opts.registrant },
      { prefix: 'Admin', info: opts.admin ?? opts.registrant },
      { prefix: 'AuxBilling', info: opts.auxBilling ?? opts.registrant },
    ];

    for (const { prefix, info } of contacts) {
      params[`${prefix}FirstName`] = info.firstName;
      params[`${prefix}LastName`] = info.lastName;
      params[`${prefix}Address1`] = info.address1;
      params[`${prefix}City`] = info.city;
      params[`${prefix}StateProvince`] = info.stateProvince;
      params[`${prefix}PostalCode`] = info.postalCode;
      params[`${prefix}Country`] = info.country;
      params[`${prefix}Phone`] = info.phone;
      params[`${prefix}EmailAddress`] = info.emailAddress;
      if (info.organizationName) params[`${prefix}OrganizationName`] = info.organizationName;
      if (info.address2) params[`${prefix}Address2`] = info.address2;
      if (info.stateProvinceChoice) params[`${prefix}StateProvinceChoice`] = info.stateProvinceChoice;
    }

    const xml = await this.apiCall('namecheap.domains.create', params);

    const elements = findElements(xml, 'DomainCreateResult');
    const el = elements[0] ?? '';

    return {
      domain: extractAttr(el, 'Domain') || opts.domainName,
      registered: extractAttr(el, 'Registered').toLowerCase() === 'true',
      chargedAmount: extractAttr(el, 'ChargedAmount') || '0.00',
      domainId: extractAttr(el, 'DomainID') || '',
      orderId: extractAttr(el, 'OrderID') || '',
      transactionId: extractAttr(el, 'TransactionID') || '',
      whoisguardEnabled: extractAttr(el, 'WhoisguardEnable').toLowerCase() === 'true',
      nonRealTimeDomain: extractAttr(el, 'NonRealTimeDomain').toLowerCase() === 'true',
    };
  }

  // ── Domain Listing ──────────────────────────────────────────────────────

  /** List domains owned by the account. */
  async listDomains(pageSize = 20, page = 1): Promise<{ domains: OwnedDomain[]; totalItems: number; paging: { totalItems: number; currentPage: number; pageSize: number } }> {
    const xml = await this.apiCall('namecheap.domains.getList', {
      PageSize: String(pageSize),
      Page: String(page),
    });

    const domains = findElements(xml, 'Domain').map(el => ({
      id: extractAttr(el, 'ID'),
      name: extractAttr(el, 'Name'),
      user: extractAttr(el, 'User'),
      created: extractAttr(el, 'Created'),
      expires: extractAttr(el, 'Expires'),
      isExpired: extractAttr(el, 'IsExpired').toLowerCase() === 'true',
      isLocked: extractAttr(el, 'IsLocked').toLowerCase() === 'true',
      autoRenew: extractAttr(el, 'AutoRenew').toLowerCase() === 'true',
      whoisGuard: extractAttr(el, 'WhoisGuard'),
      nameservers: extractAttr(el, 'Nameservers') || extractAttr(el, 'NameServers'),
    }));

    // Parse paging info
    const pagingEl = findElements(xml, 'Paging');
    const pagingXml = pagingEl[0] ?? '';
    const totalItems = parseInt(extractInnerText(pagingXml, 'TotalItems') || '0', 10);
    const currentPage = parseInt(extractInnerText(pagingXml, 'CurrentPage') || String(page), 10);

    return {
      domains,
      totalItems,
      paging: { totalItems, currentPage, pageSize },
    };
  }

  // ── DNS Records ─────────────────────────────────────────────────────────

  /** Get DNS host records for a domain. */
  async getDnsHosts(sld: string, tld: string): Promise<DnsRecord[]> {
    const xml = await this.apiCall('namecheap.domains.dns.getHosts', {
      SLD: sld,
      TLD: tld,
    });

    return findElements(xml, 'host').map(el => ({
      hostId: extractAttr(el, 'HostId'),
      name: extractAttr(el, 'Name'),
      type: extractAttr(el, 'Type'),
      address: extractAttr(el, 'Address'),
      mxPref: extractAttr(el, 'MXPref'),
      ttl: extractAttr(el, 'TTL'),
      associatedAppTitle: extractAttr(el, 'AssociatedAppTitle') || undefined,
      friendlyName: extractAttr(el, 'FriendlyName') || undefined,
      isActive: extractAttr(el, 'IsActive').toLowerCase() === 'true',
      isDDNSEnabled: extractAttr(el, 'IsDDNSEnabled').toLowerCase() === 'true',
    }));
  }

  /** Set DNS host records for a domain. Replaces ALL existing records. */
  async setDnsHosts(sld: string, tld: string, hosts: DnsHostEntry[]): Promise<{ success: boolean }> {
    const params: Record<string, string> = {
      SLD: sld,
      TLD: tld,
    };

    hosts.forEach((host, i) => {
      const n = i + 1;
      params[`HostName${n}`] = host.hostName;
      params[`RecordType${n}`] = host.recordType;
      params[`Address${n}`] = host.address;
      params[`MXPref${n}`] = host.mxPref ?? '10';
      params[`TTL${n}`] = host.ttl ?? '1800';
    });

    const xml = await this.apiCall('namecheap.domains.dns.setHosts', params);

    const elements = findElements(xml, 'DomainDNSSetHostsResult');
    const el = elements[0] ?? '';
    const isSuccess = extractAttr(el, 'IsSuccess').toLowerCase() === 'true';

    return { success: isSuccess };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Split a fully-qualified domain into SLD and TLD parts.
   * e.g. "example.com" => { sld: "example", tld: "com" }
   * e.g. "example.co.uk" => { sld: "example", tld: "co.uk" }
   */
  static splitDomain(domain: string): { sld: string; tld: string } {
    // Known multi-part TLDs
    const multiPartTlds = ['co.uk', 'org.uk', 'me.uk', 'co.in', 'co.za', 'com.au', 'net.au', 'org.au', 'com.br', 'co.jp', 'co.nz', 'com.mx'];

    const lower = domain.toLowerCase().replace(/\.$/, '');

    for (const tld of multiPartTlds) {
      if (lower.endsWith(`.${tld}`)) {
        const sld = lower.slice(0, -(tld.length + 1));
        return { sld, tld };
      }
    }

    const parts = lower.split('.');
    if (parts.length < 2) throw new Error(`Invalid domain: ${domain}`);

    const tld = parts.slice(1).join('.');
    const sld = parts[0];
    return { sld, tld };
  }

  /** Build the query URL for an API call with common params + command-specific params. */
  private buildUrl(command: string, params: Record<string, string> = {}): string {
    const base = this.config.baseUrl!;
    const qs = new URLSearchParams({
      ApiUser: this.config.apiUser,
      ApiKey: this.config.apiKey,
      UserName: this.config.userName!,
      ClientIp: this.config.clientIp,
      Command: command,
      ...params,
    });

    return `${base}?${qs.toString()}`;
  }

  /** Execute a Namecheap API call and return the raw XML response. */
  private async apiCall(command: string, params: Record<string, string> = {}): Promise<string> {
    const url = this.buildUrl(command, params);
    const res = await globalThis.fetch(url, { method: 'GET' });

    if (!res.ok) {
      throw new Error(`Namecheap API HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 500))}`);
    }

    const xml = await res.text();

    const error = checkApiErrors(xml);
    if (error) {
      throw new Error(`Namecheap API error: ${error}`);
    }

    return xml;
  }
}

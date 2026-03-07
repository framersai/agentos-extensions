import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinodeService } from '../src/LinodeService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

const TOKEN = 'test-linode-token';

function createService() {
  return new LinodeService({
    token: TOKEN,
    baseUrl: 'https://api.linode.com/v4',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LinodeService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let service: LinodeService;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initialize / shutdown ─────────────────────────────────────────────

  describe('initialize', () => {
    it('should set isRunning on valid token', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ email: 'test@example.com' }));

      await service.initialize();

      expect(service.isRunning).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linode.com/v4/account',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
    });

    it('should throw on auth failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Invalid token', 401));

      await expect(service.initialize()).rejects.toThrow('Linode auth failed: 401');
      expect(service.isRunning).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should set isRunning to false', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ email: 'test@example.com' }));
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  // ── Instances ─────────────────────────────────────────────────────────

  describe('createInstance', () => {
    it('should create a Linode instance with required fields', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 12345, label: 'web-1', status: 'provisioning', type: 'g6-nanode-1',
        region: 'us-east', image: 'linode/ubuntu22.04', ipv4: ['1.2.3.4'], ipv6: '2600::1/128',
        created: '2024-01-01', updated: '2024-01-01', tags: [],
        specs: { disk: 25600, memory: 1024, vcpus: 1, transfer: 1000 },
      }));

      const instance = await service.createInstance({
        region: 'us-east',
        type: 'g6-nanode-1',
        image: 'linode/ubuntu22.04',
        root_pass: 'secureP@ss123!',
      });

      expect(instance.id).toBe(12345);
      expect(instance.label).toBe('web-1');
      expect(instance.ipv4).toContain('1.2.3.4');
      expect(instance.specs.memory).toBe(1024);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.region).toBe('us-east');
      expect(body.root_pass).toBe('secureP@ss123!');
    });

    it('should include optional fields when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 12346, label: 'custom-node', status: 'provisioning', type: 'g6-standard-2',
        region: 'us-west', image: 'linode/ubuntu22.04', ipv4: [], ipv6: null,
        created: '', updated: '', tags: ['production'],
        specs: { disk: 51200, memory: 4096, vcpus: 2, transfer: 4000 },
      }));

      await service.createInstance({
        region: 'us-west',
        type: 'g6-standard-2',
        image: 'linode/ubuntu22.04',
        root_pass: 'pass',
        label: 'custom-node',
        tags: ['production'],
        authorized_keys: ['ssh-rsa AAAA...'],
        stackscript_id: 999,
        stackscript_data: { hostname: 'web' },
        backups_enabled: true,
        private_ip: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.label).toBe('custom-node');
      expect(body.tags).toEqual(['production']);
      expect(body.authorized_keys).toEqual(['ssh-rsa AAAA...']);
      expect(body.stackscript_id).toBe(999);
      expect(body.stackscript_data).toEqual({ hostname: 'web' });
      expect(body.backups_enabled).toBe(true);
      expect(body.private_ip).toBe(true);
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Bad Request', 400));

      await expect(service.createInstance({
        region: 'us-east', type: 'g6-nanode-1', image: 'invalid', root_pass: 'x',
      })).rejects.toThrow('Linode API 400');
    });
  });

  describe('listInstances', () => {
    it('should return paginated instances', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [
          {
            id: 1, label: 'i1', status: 'running', type: 'g6-nanode-1', region: 'us-east',
            image: 'linode/ubuntu22.04', ipv4: ['1.1.1.1'], ipv6: null,
            created: '', updated: '', tags: [],
            specs: { disk: 25600, memory: 1024, vcpus: 1, transfer: 1000 },
          },
        ],
        page: 1,
        pages: 1,
        results: 1,
      }));

      const { instances, total } = await service.listInstances();

      expect(instances).toHaveLength(1);
      expect(total).toBe(1);
      expect(instances[0].status).toBe('running');
    });

    it('should pass page and pageSize', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: [], page: 2, pages: 3, results: 50 }));

      await service.listInstances(2, 25);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('page=2');
      expect(url).toContain('page_size=25');
    });
  });

  describe('getInstance', () => {
    it('should return a single instance', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 12345, label: 'web-1', status: 'running', type: 'g6-nanode-1',
        region: 'us-east', image: 'linode/ubuntu22.04', ipv4: ['1.2.3.4'], ipv6: null,
        created: '', updated: '', tags: [],
        specs: { disk: 25600, memory: 1024, vcpus: 1, transfer: 1000 },
      }));

      const instance = await service.getInstance(12345);
      expect(instance.id).toBe(12345);
      expect(instance.label).toBe('web-1');
    });
  });

  describe('deleteInstance', () => {
    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.deleteInstance(12345);

      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/linode/instances/12345');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));

      await expect(service.deleteInstance(99999)).rejects.toThrow('Linode API 404');
    });
  });

  describe('bootInstance', () => {
    it('should POST to boot endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.bootInstance(12345);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/linode/instances/12345/boot');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Server Error', 500));

      await expect(service.bootInstance(12345)).rejects.toThrow('Linode API 500');
    });
  });

  describe('shutdownInstance', () => {
    it('should POST to shutdown endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.shutdownInstance(12345);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/linode/instances/12345/shutdown');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
  });

  // ── DNS (Domains) ─────────────────────────────────────────────────────

  describe('createDomain', () => {
    it('should create a master domain zone', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 101, domain: 'example.com', type: 'master', status: 'active',
        soa_email: 'admin@example.com', description: '', tags: [],
        created: '2024-01-01', updated: '2024-01-01',
      }));

      const domain = await service.createDomain('example.com', 'admin@example.com');

      expect(domain.id).toBe(101);
      expect(domain.domain).toBe('example.com');
      expect(domain.type).toBe('master');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.domain).toBe('example.com');
      expect(body.soa_email).toBe('admin@example.com');
      expect(body.type).toBe('master');
    });

    it('should accept optional description and tags', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 102, domain: 'test.com', type: 'master', status: 'active',
        soa_email: 'a@test.com', description: 'Test zone', tags: ['staging'],
        created: '', updated: '',
      }));

      await service.createDomain('test.com', 'a@test.com', {
        description: 'Test zone',
        tags: ['staging'],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.description).toBe('Test zone');
      expect(body.tags).toEqual(['staging']);
    });
  });

  describe('listDomains', () => {
    it('should return paginated domains', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [
          { id: 1, domain: 'example.com', type: 'master', status: 'active', soa_email: 'a@b.com', description: '', tags: [], created: '', updated: '' },
        ],
        page: 1, pages: 1, results: 1,
      }));

      const { domains, total } = await service.listDomains();
      expect(domains).toHaveLength(1);
      expect(total).toBe(1);
    });
  });

  describe('createDomainRecord', () => {
    it('should create a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 200, type: 'A', name: 'api', target: '1.2.3.4', ttl_sec: 300,
      }));

      const record = await service.createDomainRecord(101, {
        type: 'A', name: 'api', target: '1.2.3.4', ttl_sec: 300,
      });

      expect(record.id).toBe(200);
      expect(record.type).toBe('A');
      expect(record.target).toBe('1.2.3.4');
    });
  });

  describe('listDomainRecords', () => {
    it('should return paginated DNS records', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [
          { id: 200, type: 'A', name: 'api', target: '1.2.3.4', ttl_sec: 300 },
          { id: 201, type: 'CNAME', name: 'www', target: 'example.com', ttl_sec: 300 },
        ],
        page: 1, pages: 1, results: 2,
      }));

      const { records, total } = await service.listDomainRecords(101);

      expect(records).toHaveLength(2);
      expect(total).toBe(2);
    });
  });

  describe('updateDomainRecord', () => {
    it('should update a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 200, type: 'A', name: 'api', target: '5.6.7.8', ttl_sec: 600,
      }));

      const record = await service.updateDomainRecord(101, 200, { target: '5.6.7.8', ttl_sec: 600 });

      expect(record.target).toBe('5.6.7.8');
      expect(record.ttl_sec).toBe(600);
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });
  });

  describe('deleteDomainRecord', () => {
    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, 200));

      await service.deleteDomainRecord(101, 200);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/domains/101/records/200');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));

      await expect(service.deleteDomainRecord(101, 999)).rejects.toThrow('Linode API 404');
    });
  });

  // ── Types & Regions ───────────────────────────────────────────────────

  describe('listTypes', () => {
    it('should return mapped instance types', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [
          {
            id: 'g6-nanode-1', label: 'Nanode 1GB',
            price: { hourly: 0.0075, monthly: 5 },
            memory: 1024, disk: 25600, vcpus: 1, transfer: 1000,
            class: 'nanode',
          },
          {
            id: 'g6-standard-2', label: 'Linode 4GB',
            price: { hourly: 0.03, monthly: 20 },
            memory: 4096, disk: 81920, vcpus: 2, transfer: 4000,
            class: 'standard',
          },
        ],
        page: 1, pages: 1, results: 2,
      }));

      const types = await service.listTypes();

      expect(types).toHaveLength(2);
      expect(types[0].id).toBe('g6-nanode-1');
      expect(types[0].price.monthly).toBe(5);
      expect(types[0].class).toBe('nanode');
    });
  });

  describe('listRegions', () => {
    it('should return mapped regions', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [
          { id: 'us-east', label: 'Newark, NJ', country: 'us', capabilities: ['Linodes', 'NodeBalancers'], status: 'ok' },
          { id: 'eu-west', label: 'London, UK', country: 'gb', capabilities: ['Linodes'], status: 'ok' },
        ],
        page: 1, pages: 1, results: 2,
      }));

      const regions = await service.listRegions();

      expect(regions).toHaveLength(2);
      expect(regions[0].id).toBe('us-east');
      expect(regions[0].country).toBe('us');
      expect(regions[1].capabilities).toContain('Linodes');
    });
  });

  // ── IP Addresses ──────────────────────────────────────────────────────

  describe('allocateIp', () => {
    it('should allocate a public IPv4 by default', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        address: '10.20.30.40', type: 'ipv4', public: true,
      }));

      const ip = await service.allocateIp(12345);

      expect(ip.address).toBe('10.20.30.40');
      expect(ip.public).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('ipv4');
      expect(body.public).toBe(true);
    });

    it('should support private IP allocation', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        address: '192.168.1.1', type: 'ipv4', public: false,
      }));

      const ip = await service.allocateIp(12345, { public: false });

      expect(ip.address).toBe('192.168.1.1');
      expect(ip.public).toBe(false);
    });
  });

  // ── NodeBalancers ─────────────────────────────────────────────────────

  describe('createNodeBalancer', () => {
    it('should create a NodeBalancer with minimal options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 5000, label: 'nb-1', region: 'us-east',
        hostname: 'nb-1.nodebalancer.linode.com', ipv4: '50.50.50.50', ipv6: null,
        client_conn_throttle: 0, tags: [],
        created: '2024-01-01', updated: '2024-01-01',
        transfer: { in: 0, out: 0, total: 0 },
      }));

      const nb = await service.createNodeBalancer('us-east', { label: 'nb-1' });

      expect(nb.id).toBe(5000);
      expect(nb.hostname).toBe('nb-1.nodebalancer.linode.com');
      expect(nb.ipv4).toBe('50.50.50.50');
    });

    it('should include configs and tags when provided', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        id: 5001, label: 'nb-2', region: 'us-west',
        hostname: 'nb-2.nodebalancer.linode.com', ipv4: '60.60.60.60', ipv6: null,
        client_conn_throttle: 20, tags: ['prod'],
        created: '', updated: '',
        transfer: { in: 100, out: 200, total: 300 },
      }));

      await service.createNodeBalancer('us-west', {
        label: 'nb-2',
        client_conn_throttle: 20,
        tags: ['prod'],
        configs: [{
          port: 443,
          protocol: 'https',
          algorithm: 'roundrobin',
          nodes: [{ address: '192.168.1.1:8080', label: 'backend-1' }],
        }],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.region).toBe('us-west');
      expect(body.client_conn_throttle).toBe(20);
      expect(body.tags).toEqual(['prod']);
      expect(body.configs).toHaveLength(1);
      expect(body.configs[0].port).toBe(443);
    });
  });
});

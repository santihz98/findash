import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new ConfigService();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when apiUrl is read before load()', () => {
    expect(() => service.apiUrl).toThrowError(/todavía no se cargó/);
  });

  it('fetches assets/config.json and exposes apiUrl after load()', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ apiUrl: 'http://localhost:3000' }),
    });

    await service.load();

    expect(fetchSpy).toHaveBeenCalledWith('assets/config.json');
    expect(service.apiUrl).toBe('http://localhost:3000');
  });

  it('throws a descriptive error when the fetch response is not ok', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404 });

    await expect(service.load()).rejects.toThrowError(/HTTP 404/);
  });
});

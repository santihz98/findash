import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    localStorage.clear();
    service = new TokenStorageService();
  });

  it('returns null for both tokens when nothing was ever stored', () => {
    expect(service.readAccessToken()).toBeNull();
    expect(service.readRefreshToken()).toBeNull();
  });

  it('setTokens() persists both tokens, readable independently', () => {
    service.setTokens('access-1', 'refresh-1');
    expect(service.readAccessToken()).toBe('access-1');
    expect(service.readRefreshToken()).toBe('refresh-1');
  });

  it('setAccessToken() replaces only the access token, leaving the refresh token untouched', () => {
    service.setTokens('access-1', 'refresh-1');
    service.setAccessToken('access-2');
    expect(service.readAccessToken()).toBe('access-2');
    expect(service.readRefreshToken()).toBe('refresh-1');
  });

  it('clear() removes both tokens', () => {
    service.setTokens('access-1', 'refresh-1');
    service.clear();
    expect(service.readAccessToken()).toBeNull();
    expect(service.readRefreshToken()).toBeNull();
  });

  it('fails silently (does not throw) when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => service.setTokens('a', 'r')).not.toThrow();

    setItemSpy.mockRestore();
  });

  it('returns null (does not throw) when localStorage.getItem throws', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(service.readAccessToken()).toBeNull();

    getItemSpy.mockRestore();
  });

  it('fails silently (does not throw) when localStorage.removeItem throws', () => {
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => service.clear()).not.toThrow();

    removeItemSpy.mockRestore();
  });
});

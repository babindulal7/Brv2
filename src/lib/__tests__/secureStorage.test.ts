// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectPlatform,
  getSecureAuthStorage,
  WebLocalStorageAdapter,
  CapacitorKeystoreAdapter,
  TauriStrongholdAdapter,
} from '../secureStorage';

describe('secureStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectPlatform', () => {
    it('detects web platform by default', () => {
      expect(detectPlatform()).toBe('web');
    });

    it('detects capacitor platform when Capacitor.isNativePlatform is true', () => {
      (window as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      expect(detectPlatform()).toBe('capacitor');
      delete (window as any).Capacitor;
    });

    it('detects tauri platform when __TAURI__ is present', () => {
      (window as any).__TAURI__ = {};
      expect(detectPlatform()).toBe('tauri');
      delete (window as any).__TAURI__;
    });
  });

  describe('WebLocalStorageAdapter', () => {
    it('reads the refreshed session when writes fail but reads still work', () => {
      const adapter = new WebLocalStorageAdapter();
      localStorage.setItem('session', 'expired');
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      adapter.setItem('session', 'refreshed');
      expect(adapter.getItem('session')).toBe('refreshed');
    });

    it('does not restore a signed-out session when removal fails', () => {
      const adapter = new WebLocalStorageAdapter();
      localStorage.setItem('session', 'old');
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      adapter.removeItem('session');
      expect(adapter.getItem('session')).toBeNull();
    });

    it('clears fallback values after storage recovers and the session is removed', () => {
      const adapter = new WebLocalStorageAdapter();
      const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      adapter.setItem('session', 'temporary');
      write.mockRestore();
      adapter.setItem('session', 'persisted');
      expect(adapter.getItem('session')).toBe('persisted');
      adapter.removeItem('session');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      expect(adapter.getItem('session')).toBeNull();
    });

    it('persists and retrieves items via localStorage', () => {
      const adapter = new WebLocalStorageAdapter();
      adapter.setItem('test_token', 'jwt_secret_123');
      expect(adapter.getItem('test_token')).toBe('jwt_secret_123');
      expect(localStorage.getItem('test_token')).toBe('jwt_secret_123');

      adapter.removeItem('test_token');
      expect(adapter.getItem('test_token')).toBeNull();
      expect(localStorage.getItem('test_token')).toBeNull();
    });

    it('falls back to in-memory storage if localStorage throws', () => {
      const adapter = new WebLocalStorageAdapter();
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      adapter.setItem('fallback_token', 'fallback_val');
      expect(adapter.getItem('fallback_token')).toBe('fallback_val');

      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
    });
  });

  describe('CapacitorKeystoreAdapter', () => {
    it('uses native SecureStoragePlugin when available', async () => {
      const mockPlugin = {
        get: vi.fn().mockResolvedValue({ value: 'encrypted_token' }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      (window as any).Capacitor = {
        Plugins: {
          SecureStoragePlugin: mockPlugin,
        },
      };

      const adapter = new CapacitorKeystoreAdapter();
      await adapter.setItem('sb-token', 'my_secret');
      expect(mockPlugin.set).toHaveBeenCalledWith({ key: 'sb-token', value: 'my_secret' });

      const val = await adapter.getItem('sb-token');
      expect(val).toBe('encrypted_token');

      await adapter.removeItem('sb-token');
      expect(mockPlugin.remove).toHaveBeenCalledWith({ key: 'sb-token' });

      delete (window as any).Capacitor;
    });

    it('uses in-memory fallback without touching unencrypted localStorage when native plugin is unlinked', async () => {
      delete (window as any).Capacitor;
      const adapter = new CapacitorKeystoreAdapter();

      await adapter.setItem('sb-token', 'secret_val');
      expect(await adapter.getItem('sb-token')).toBe('secret_val');
      // Crucial: tokens must never reach localStorage in native adapter
      expect(localStorage.getItem('sb-token')).toBeNull();

      await adapter.removeItem('sb-token');
      expect(await adapter.getItem('sb-token')).toBeNull();
    });
  });

  describe('TauriStrongholdAdapter', () => {
    it('uses Tauri IPC invoke for plugin:stronghold', async () => {
      const mockInvoke = vi.fn().mockImplementation(async (cmd, _args) => {
        if (cmd === 'plugin:stronghold|get_record') {
          return { value: 'vault_secret' };
        }
        return undefined;
      });

      (window as any).__TAURI__ = {
        core: { invoke: mockInvoke },
      };

      const adapter = new TauriStrongholdAdapter();
      await adapter.setItem('sb-token', 'val');
      expect(mockInvoke).toHaveBeenCalledWith('plugin:stronghold|set_record', { key: 'sb-token', value: 'val' });

      const val = await adapter.getItem('sb-token');
      expect(val).toBe('vault_secret');

      await adapter.removeItem('sb-token');
      expect(mockInvoke).toHaveBeenCalledWith('plugin:stronghold|remove_record', { key: 'sb-token' });

      delete (window as any).__TAURI__;
    });
  });

  describe('getSecureAuthStorage', () => {
    it('returns WebLocalStorageAdapter in standard browser environment', () => {
      const storage = getSecureAuthStorage();
      expect(storage).toBeInstanceOf(WebLocalStorageAdapter);
    });
  });
});

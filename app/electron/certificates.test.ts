/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Tests for certificate handling module.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs module using vi.hoisted for proper hoisting
const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
  };
});

// Mock the tls module using vi.hoisted for proper hoisting
const { mockGetCACertificates, mockSetDefaultCACertificates } = vi.hoisted(() => ({
  mockGetCACertificates: vi.fn(),
  mockSetDefaultCACertificates: vi.fn(),
}));

vi.mock('node:tls', async importOriginal => {
  const actual = await importOriginal<typeof import('node:tls')>();
  return {
    ...actual,
    rootCertificates: ['-----BEGIN CERTIFICATE-----\nmock-node-ca\n-----END CERTIFICATE-----'],
    getCACertificates: mockGetCACertificates,
    setDefaultCACertificates: mockSetDefaultCACertificates,
  };
});

import { loadCustomCAs, setupCustomCAs, setupSystemCAs } from './certificates';

describe('certificates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCACertificates.mockReset();
    mockSetDefaultCACertificates.mockReset();
    mockReadFileSync.mockReset();
  });

  describe('setupSystemCAs', () => {
    it('should merge system CAs with Node CAs when enabled', () => {
      const mockSystemCAs = [
        '-----BEGIN CERTIFICATE-----\nmock-system-ca\n-----END CERTIFICATE-----',
      ];
      const mockNodeCAs = ['-----BEGIN CERTIFICATE-----\nmock-node-ca\n-----END CERTIFICATE-----'];
      mockGetCACertificates.mockImplementation((type: string) => {
        if (type === 'system') return mockSystemCAs;
        if (type === 'default') return mockNodeCAs;
        return [];
      });

      setupSystemCAs({ useSystemCAs: true });

      expect(mockGetCACertificates).toHaveBeenCalledWith('system');
      expect(mockGetCACertificates).toHaveBeenCalledWith('default');
      expect(mockSetDefaultCACertificates).toHaveBeenCalledWith(
        expect.arrayContaining([...mockNodeCAs, ...mockSystemCAs])
      );
    });

    it('should skip system CA merging when disabled', () => {
      setupSystemCAs({ useSystemCAs: false });

      expect(mockGetCACertificates).not.toHaveBeenCalled();
      expect(mockSetDefaultCACertificates).not.toHaveBeenCalled();
    });

    it('should handle empty system CA list gracefully', () => {
      mockGetCACertificates.mockReturnValue([]);

      setupSystemCAs({ useSystemCAs: true });

      expect(mockSetDefaultCACertificates).not.toHaveBeenCalled();
    });

    it('should handle getCACertificates errors gracefully', () => {
      mockGetCACertificates.mockImplementation(() => {
        throw new Error('System CA retrieval failed');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      setupSystemCAs({ useSystemCAs: true });

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockSetDefaultCACertificates).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle setDefaultCACertificates errors gracefully', () => {
      mockGetCACertificates.mockReturnValue([
        '-----BEGIN CERTIFICATE-----\nmock-system-ca\n-----END CERTIFICATE-----',
      ]);
      mockSetDefaultCACertificates.mockImplementationOnce(() => {
        throw new Error('setDefaultCACertificates failed');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      setupSystemCAs({ useSystemCAs: true });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('loadCustomCAs', () => {
    it('should load custom CA certificates from file', () => {
      const mockCAContent =
        '-----BEGIN CERTIFICATE-----\nmock-ca-1\n-----END CERTIFICATE-----\n' +
        '-----BEGIN CERTIFICATE-----\nmock-ca-2\n-----END CERTIFICATE-----';
      mockReadFileSync.mockReturnValue(mockCAContent);

      const caCerts = loadCustomCAs('/path/to/ca-bundle.crt');

      expect(caCerts).toHaveLength(2);
      expect(caCerts[0]).toContain('mock-ca-1');
      expect(caCerts[1]).toContain('mock-ca-2');
    });

    it('should handle file read errors gracefully', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const caCerts = loadCustomCAs('/path/to/nonexistent.crt');

      expect(caCerts).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle empty CA bundle file', () => {
      mockReadFileSync.mockReturnValue('');

      const caCerts = loadCustomCAs('/path/to/empty.crt');

      expect(caCerts).toEqual([]);
    });
  });

  describe('setupCustomCAs', () => {
    it('should merge custom CAs with existing root certificates', () => {
      const mockNodeCAs = ['-----BEGIN CERTIFICATE-----\nmock-node-ca\n-----END CERTIFICATE-----'];
      const mockCAContent =
        '-----BEGIN CERTIFICATE-----\nmock-custom-ca\n-----END CERTIFICATE-----';
      mockGetCACertificates.mockImplementation((type: string) => {
        if (type === 'default') return mockNodeCAs;
        return [];
      });
      mockReadFileSync.mockReturnValue(mockCAContent);

      setupCustomCAs('/path/to/ca-bundle.crt');

      expect(mockSetDefaultCACertificates).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-----BEGIN CERTIFICATE-----\nmock-node-ca\n-----END CERTIFICATE-----',
          '-----BEGIN CERTIFICATE-----\nmock-custom-ca\n-----END CERTIFICATE-----',
        ])
      );
    });

    it('should handle setDefaultCACertificates errors gracefully', () => {
      mockGetCACertificates.mockReturnValue([
        '-----BEGIN CERTIFICATE-----\nmock-node-ca\n-----END CERTIFICATE-----',
      ]);
      mockReadFileSync.mockReturnValue(
        '-----BEGIN CERTIFICATE-----\nmock-custom-ca\n-----END CERTIFICATE-----'
      );
      mockSetDefaultCACertificates.mockImplementationOnce(() => {
        throw new Error('setDefaultCACertificates failed');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      setupCustomCAs('/path/to/ca-bundle.crt');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should warn when no custom CAs are loaded', () => {
      mockGetCACertificates.mockReturnValue([
        '-----BEGIN CERTIFICATE-----\nmock-node-ca\n-----END CERTIFICATE-----',
      ]);
      mockReadFileSync.mockReturnValue('');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      setupCustomCAs('/path/to/empty.crt');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No custom CA certificates loaded')
      );
      expect(mockSetDefaultCACertificates).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

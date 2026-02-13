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

import { describe, expect, it } from '@jest/globals';
import * as net from 'net';
import {
  checkPortAvailability,
  createLocalhostErrorMessage,
  createNoPortsAvailableMessage,
  isPortAvailableOnHost,
} from './portUtils';

describe('portUtils', () => {
  describe('isPortAvailableOnHost', () => {
    it('should return available=true for an available port on localhost', async () => {
      // Let OS choose a free port
      const server = net.createServer();
      const port = await new Promise<number>(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address() as net.AddressInfo;
          server.close(() => resolve(addr.port));
        });
      });

      const result = await isPortAvailableOnHost(port, 'localhost');
      expect(result.available).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it('should return available=true for an available port on 127.0.0.1', async () => {
      const server = net.createServer();
      const port = await new Promise<number>(resolve => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as net.AddressInfo;
          server.close(() => resolve(addr.port));
        });
      });

      const result = await isPortAvailableOnHost(port, '127.0.0.1');
      expect(result.available).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it('should return available=false with EADDRINUSE for a port that is in use', async () => {
      // Create a server to occupy a port
      const server = net.createServer();
      const port = await new Promise<number>(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });

      try {
        const result = await isPortAvailableOnHost(port, 'localhost');
        expect(result.available).toBe(false);
        expect(result.errorCode).toBe('EADDRINUSE');
      } finally {
        await new Promise<void>(resolve => {
          server.close(() => resolve());
        });
      }
    });
  });

  describe('checkPortAvailability', () => {
    it('should return localhost when port is available on localhost', async () => {
      const server = net.createServer();
      const port = await new Promise<number>(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address() as net.AddressInfo;
          server.close(() => resolve(addr.port));
        });
      });

      const result = await checkPortAvailability(port);

      expect(result.available).toBe(true);
      expect(result.host).toBe('localhost');
      expect(result.resolutionFailed).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should return unavailable without fallback when port is occupied (EADDRINUSE)', async () => {
      // Occupy a port on localhost specifically
      const server = net.createServer();
      const port = await new Promise<number>(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });

      try {
        const result = await checkPortAvailability(port);

        expect(result.available).toBe(false);
        expect(result.resolutionFailed).toBe(false); // Port occupied, not resolution failure
        expect(result.errorCode).toBe('EADDRINUSE');
      } finally {
        await new Promise<void>(resolve => {
          server.close(() => resolve());
        });
      }
    });
  });

  describe('createLocalhostErrorMessage', () => {
    it('should create a helpful error message with troubleshooting steps', () => {
      const message = createLocalhostErrorMessage(4466, 4565);

      expect(message).toContain('4466-4565');
      expect(message).toContain('localhost');
      expect(message).toContain('127.0.0.1');
      expect(message).toContain('::1');
      expect(message).toContain('Troubleshooting steps');
      expect(message).toContain('/etc/hosts');
      expect(message).toContain('ping localhost');
      expect(message).toContain('lsof');
      expect(message).toContain('--port flag');
    });
  });

  describe('createNoPortsAvailableMessage', () => {
    it('should create error message without resolution failure note', () => {
      const message = createNoPortsAvailableMessage(4466, 100, false);

      expect(message).toContain('4466');
      expect(message).toContain('4565'); // 4466 + 100 - 1
      expect(message).toContain('100 attempts');
      expect(message).not.toContain('resolution failed');
      expect(message).not.toContain('fallback');
    });

    it('should create error message with resolution failure note', () => {
      const message = createNoPortsAvailableMessage(4466, 100, true);

      expect(message).toContain('4466');
      expect(message).toContain('4565');
      expect(message).toContain('100 attempts');
      expect(message).toContain('resolution failed');
      expect(message).toContain('fallback');
    });

    it('should calculate correct port range', () => {
      const message = createNoPortsAvailableMessage(5000, 50, true);

      expect(message).toContain('5000');
      expect(message).toContain('5049'); // 5000 + 50 - 1
    });
  });
});

"use strict";

var _globals = require("@jest/globals");
var net = _interopRequireWildcard(require("net"));
var _portUtils = require("./portUtils");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
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

(0, _globals.describe)('portUtils', () => {
  (0, _globals.describe)('isPortAvailableOnHost', () => {
    (0, _globals.it)('should return available=true for an available port on localhost', async () => {
      // Let OS choose a free port
      const server = net.createServer();
      const port = await new Promise(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address();
          server.close(() => resolve(addr.port));
        });
      });
      const result = await (0, _portUtils.isPortAvailableOnHost)(port, 'localhost');
      (0, _globals.expect)(result.available).toBe(true);
      (0, _globals.expect)(result.errorCode).toBeUndefined();
    });
    (0, _globals.it)('should return available=true for an available port on 127.0.0.1', async () => {
      const server = net.createServer();
      const port = await new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          server.close(() => resolve(addr.port));
        });
      });
      const result = await (0, _portUtils.isPortAvailableOnHost)(port, '127.0.0.1');
      (0, _globals.expect)(result.available).toBe(true);
      (0, _globals.expect)(result.errorCode).toBeUndefined();
    });
    (0, _globals.it)('should return available=false with EADDRINUSE for a port that is in use', async () => {
      // Create a server to occupy a port
      const server = net.createServer();
      const port = await new Promise(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address();
          resolve(addr.port);
        });
      });
      try {
        const result = await (0, _portUtils.isPortAvailableOnHost)(port, 'localhost');
        (0, _globals.expect)(result.available).toBe(false);
        (0, _globals.expect)(result.errorCode).toBe('EADDRINUSE');
      } finally {
        await new Promise(resolve => {
          server.close(() => resolve());
        });
      }
    });
  });
  (0, _globals.describe)('checkPortAvailability', () => {
    (0, _globals.it)('should return localhost when port is available on localhost', async () => {
      const server = net.createServer();
      const port = await new Promise(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address();
          server.close(() => resolve(addr.port));
        });
      });
      const result = await (0, _portUtils.checkPortAvailability)(port);
      (0, _globals.expect)(result.available).toBe(true);
      (0, _globals.expect)(result.host).toBe('localhost');
      (0, _globals.expect)(result.resolutionFailed).toBe(false);
      (0, _globals.expect)(result.error).toBeUndefined();
    });
    (0, _globals.it)('should return unavailable without fallback when port is occupied (EADDRINUSE)', async () => {
      // Occupy a port on localhost specifically
      const server = net.createServer();
      const port = await new Promise(resolve => {
        server.listen(0, 'localhost', () => {
          const addr = server.address();
          resolve(addr.port);
        });
      });
      try {
        const result = await (0, _portUtils.checkPortAvailability)(port);
        (0, _globals.expect)(result.available).toBe(false);
        (0, _globals.expect)(result.resolutionFailed).toBe(false); // Port occupied, not resolution failure
        (0, _globals.expect)(result.errorCode).toBe('EADDRINUSE');
      } finally {
        await new Promise(resolve => {
          server.close(() => resolve());
        });
      }
    });
  });
  (0, _globals.describe)('createLocalhostErrorMessage', () => {
    (0, _globals.it)('should create a helpful error message with troubleshooting steps', () => {
      const message = (0, _portUtils.createLocalhostErrorMessage)(4466, 4565);
      (0, _globals.expect)(message).toContain('4466-4565');
      (0, _globals.expect)(message).toContain('localhost');
      (0, _globals.expect)(message).toContain('127.0.0.1');
      (0, _globals.expect)(message).toContain('::1');
      (0, _globals.expect)(message).toContain('Troubleshooting steps');
      (0, _globals.expect)(message).toContain('/etc/hosts');
      (0, _globals.expect)(message).toContain('ping localhost');
      (0, _globals.expect)(message).toContain('lsof');
      (0, _globals.expect)(message).toContain('--port flag');
    });
  });
  (0, _globals.describe)('createNoPortsAvailableMessage', () => {
    (0, _globals.it)('should create error message without resolution failure note', () => {
      const message = (0, _portUtils.createNoPortsAvailableMessage)(4466, 100, false);
      (0, _globals.expect)(message).toContain('4466');
      (0, _globals.expect)(message).toContain('4565'); // 4466 + 100 - 1
      (0, _globals.expect)(message).toContain('100 attempts');
      (0, _globals.expect)(message).not.toContain('resolution failed');
      (0, _globals.expect)(message).not.toContain('fallback');
    });
    (0, _globals.it)('should create error message with resolution failure note', () => {
      const message = (0, _portUtils.createNoPortsAvailableMessage)(4466, 100, true);
      (0, _globals.expect)(message).toContain('4466');
      (0, _globals.expect)(message).toContain('4565');
      (0, _globals.expect)(message).toContain('100 attempts');
      (0, _globals.expect)(message).toContain('resolution failed');
      (0, _globals.expect)(message).toContain('fallback');
    });
    (0, _globals.it)('should calculate correct port range', () => {
      const message = (0, _portUtils.createNoPortsAvailableMessage)(5000, 50, true);
      (0, _globals.expect)(message).toContain('5000');
      (0, _globals.expect)(message).toContain('5049'); // 5000 + 50 - 1
    });
  });
});
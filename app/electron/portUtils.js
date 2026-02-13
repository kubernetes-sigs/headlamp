"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.checkPortAvailability = checkPortAvailability;
exports.createLocalhostErrorMessage = createLocalhostErrorMessage;
exports.createNoPortsAvailableMessage = createNoPortsAvailableMessage;
exports.isPortAvailableOnHost = isPortAvailableOnHost;
var net = _interopRequireWildcard(require("net"));
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

/**
 * Result of checking port availability with detailed information
 */

/**
 * Check if a port is available on a specific host
 * @param port Port number to check
 * @param host Host address to bind to (e.g., 'localhost', '127.0.0.1', or '::1')
 * @returns Promise with availability status and error code
 */
async function isPortAvailableOnHost(port, host) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', err => {
      resolve({
        available: false,
        errorCode: err.code
      });
    });
    server.once('listening', () => {
      server.close(() => resolve({
        available: true
      }));
    });
    try {
      server.listen({
        port,
        host,
        exclusive: true
      });
    } catch (err) {
      server.emit('error', err);
    }
  });
}

/**
 * Check if a port is available, trying localhost first with IPv4 and IPv6 fallbacks
 * This handles the case where localhost may not resolve correctly (e.g., macOS 15.5)
 * @param port Port number to check
 * @returns Promise with detailed result about port availability
 */
async function checkPortAvailability(port) {
  // Try localhost first
  const localhostResult = await isPortAvailableOnHost(port, 'localhost');
  if (localhostResult.available) {
    return {
      available: true,
      host: 'localhost',
      resolutionFailed: false
    };
  }

  // Check if this is a resolution/configuration error or just port occupied
  const isResolutionError = localhostResult.errorCode && ['ENOTFOUND', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ENETUNREACH'].includes(localhostResult.errorCode);

  // If localhost failed due to resolution error, try IPv4 fallback
  if (isResolutionError) {
    const ipv4Result = await isPortAvailableOnHost(port, '127.0.0.1');
    if (ipv4Result.available) {
      return {
        available: true,
        host: '127.0.0.1',
        resolutionFailed: true,
        errorCode: localhostResult.errorCode
      };
    }

    // If IPv4 also failed, try IPv6 as last resort
    const ipv6Result = await isPortAvailableOnHost(port, '::1');
    if (ipv6Result.available) {
      return {
        available: true,
        host: '::1',
        resolutionFailed: true,
        errorCode: localhostResult.errorCode
      };
    }

    // All failed with resolution errors
    return {
      available: false,
      host: 'localhost',
      resolutionFailed: true,
      errorCode: localhostResult.errorCode,
      error: `Port ${port} is not available on 'localhost', '127.0.0.1', or '::1'`
    };
  }

  // Port is simply occupied (EADDRINUSE), no need for fallback
  return {
    available: false,
    host: 'localhost',
    resolutionFailed: false,
    errorCode: localhostResult.errorCode
  };
}

/**
 * Creates an informative error message when localhost cannot be resolved
 */
function createLocalhostErrorMessage(startPort, endPort) {
  return `Could not find an available port in range ${startPort}-${endPort}.

This may indicate a network configuration issue:
- 'localhost' does not resolve correctly on your system
- All fallback attempts to '127.0.0.1' and '::1' also failed

Troubleshooting steps:
1. Check that 'localhost' resolves correctly: ping localhost
2. Verify /etc/hosts contains: 127.0.0.1 localhost and ::1 localhost
3. Check if ports ${startPort}-${endPort} are occupied: lsof -i :${startPort}-${endPort}
4. Try setting a different port range with --port flag

For more information, see: https://headlamp.dev/docs/latest/installation/desktop/`;
}

/**
 * Creates a standard error message for when no ports are available
 */
function createNoPortsAvailableMessage(startPort, attempts, resolutionFailed) {
  const endPort = startPort + attempts - 1;
  const hostInfo = resolutionFailed ? " Note: 'localhost' resolution failed, used fallback addresses." : '';
  return `Could not find an available port after ${attempts} attempts starting from ${startPort} (range: ${startPort}-${endPort}).${hostInfo}`;
}
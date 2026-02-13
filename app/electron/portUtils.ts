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

import * as net from 'net';

/**
 * Result of checking port availability with detailed information
 */
export interface PortCheckResult {
  /** Whether the port is available */
  available: boolean;
  /** The host address that worked ('localhost', '127.0.0.1', or '::1') */
  host: string;
  /** Whether there was a resolution/configuration failure (not just port occupied) */
  resolutionFailed: boolean;
  /** Error code from the bind attempt, if any */
  errorCode?: string;
  /** Error message if all hosts failed */
  error?: string;
}

/**
 * Check if a port is available on a specific host
 * @param port Port number to check
 * @param host Host address to bind to (e.g., 'localhost', '127.0.0.1', or '::1')
 * @returns Promise with availability status and error code
 */
export async function isPortAvailableOnHost(
  port: number,
  host: string
): Promise<{ available: boolean; errorCode?: string }> {
  return new Promise(resolve => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      resolve({ available: false, errorCode: err.code });
    });

    server.once('listening', () => {
      server.close(() => resolve({ available: true }));
    });

    try {
      server.listen({ port, host, exclusive: true });
    } catch (err) {
      server.emit('error', err as NodeJS.ErrnoException);
    }
  });
}

/**
 * Check if a port is available, trying localhost first with IPv4 and IPv6 fallbacks
 * This handles the case where localhost may not resolve correctly (e.g., macOS 15.5)
 * @param port Port number to check
 * @returns Promise with detailed result about port availability
 */
export async function checkPortAvailability(port: number): Promise<PortCheckResult> {
  // Try localhost first
  const localhostResult = await isPortAvailableOnHost(port, 'localhost');
  if (localhostResult.available) {
    return {
      available: true,
      host: 'localhost',
      resolutionFailed: false,
    };
  }

  // Check if this is a resolution/configuration error or just port occupied
  const isResolutionError =
    localhostResult.errorCode &&
    ['ENOTFOUND', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ENETUNREACH'].includes(
      localhostResult.errorCode
    );

  // If localhost failed due to resolution error, try both IPv4 and IPv6 fallbacks
  if (isResolutionError) {
    // Try IPv4 explicitly
    const ipv4Result = await isPortAvailableOnHost(port, '127.0.0.1');
    if (ipv4Result.available) {
      return {
        available: true,
        host: '127.0.0.1',
        resolutionFailed: true,
        errorCode: localhostResult.errorCode,
      };
    }

    // Try IPv6 explicitly (independent of IPv4 result)
    const ipv6Result = await isPortAvailableOnHost(port, '::1');
    if (ipv6Result.available) {
      return {
        available: true,
        host: '::1',
        resolutionFailed: true,
        errorCode: localhostResult.errorCode,
      };
    }

    // All addresses failed with resolution errors
    return {
      available: false,
      host: 'localhost',
      resolutionFailed: true,
      errorCode: localhostResult.errorCode,
      error: `Port ${port} is not available on 'localhost', '127.0.0.1', or '::1'`,
    };
  }

  // Port is simply occupied (EADDRINUSE), no need for fallback
  return {
    available: false,
    host: 'localhost',
    resolutionFailed: false,
    errorCode: localhostResult.errorCode,
  };
}

/**
 * Creates an informative error message when localhost cannot be resolved
 */
export function createLocalhostErrorMessage(startPort: number, endPort: number): string {
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
export function createNoPortsAvailableMessage(
  startPort: number,
  attempts: number,
  resolutionFailed: boolean
): string {
  const endPort = startPort + attempts - 1;
  const hostInfo = resolutionFailed
    ? " Note: 'localhost' resolution failed, used fallback addresses."
    : '';

  return `Could not find an available port after ${attempts} attempts starting from ${startPort} (range: ${startPort}-${endPort}).${hostInfo}`;
}

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
  /** The host address that worked ('localhost' or '127.0.0.1') */
  host: string;
  /** Whether localhost resolution failed */
  localhostFailed: boolean;
  /** Error message if both localhost and 127.0.0.1 failed */
  error?: string;
}

/**
 * Check if a port is available on a specific host
 * @param port Port number to check
 * @param host Host address to bind to (e.g., 'localhost' or '127.0.0.1')
 * @returns Promise that resolves to true if port is available, false otherwise
 */
export async function isPortAvailableOnHost(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    try {
      server.listen({ port, host, exclusive: true });
    } catch (err) {
      server.emit('error', err as NodeJS.ErrnoException);
    }
  });
}

/**
 * Check if a port is available, trying localhost first and 127.0.0.1 as fallback
 * This handles the case where localhost may not resolve correctly (e.g., macOS 15.5)
 * @param port Port number to check
 * @returns Promise with detailed result about port availability
 */
export async function checkPortAvailability(port: number): Promise<PortCheckResult> {
  // Try localhost first
  const localhostAvailable = await isPortAvailableOnHost(port, 'localhost');
  if (localhostAvailable) {
    return {
      available: true,
      host: 'localhost',
      localhostFailed: false,
    };
  }

  // If localhost doesn't work, try 127.0.0.1 as fallback
  console.warn(
    `Port ${port} check failed on 'localhost', trying '127.0.0.1' as fallback...`
  );
  const fallbackAvailable = await isPortAvailableOnHost(port, '127.0.0.1');
  if (fallbackAvailable) {
    return {
      available: true,
      host: '127.0.0.1',
      localhostFailed: true,
    };
  }

  // Both failed - port is occupied or there's a network configuration issue
  return {
    available: false,
    host: 'localhost', // Default to localhost for error reporting
    localhostFailed: true,
    error: `Port ${port} is not available on 'localhost' or '127.0.0.1'`,
  };
}

/**
 * Creates an informative error message when localhost cannot be resolved
 */
export function createLocalhostErrorMessage(startPort: number, endPort: number): string {
  return `Could not find an available port in range ${startPort}-${endPort}.

This may indicate a network configuration issue:
- 'localhost' does not resolve correctly on your system
- All fallback attempts to '127.0.0.1' also failed

Troubleshooting steps:
1. Check that 'localhost' resolves correctly: ping localhost
2. Verify /etc/hosts contains: 127.0.0.1 localhost
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
  localhostFailed: boolean
): string {
  const endPort = startPort + attempts - 1;
  const hostInfo = localhostFailed
    ? " Note: 'localhost' resolution failed, used '127.0.0.1' as fallback."
    : '';

  return `Could not find an available port after ${attempts} attempts starting from ${startPort} (range: ${startPort}-${endPort}).${hostInfo}`;
}

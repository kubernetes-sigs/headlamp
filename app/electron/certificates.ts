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
 * Certificate handling for TLS-inspecting proxy support.
 *
 * Merges system CA certificates with Node's bundled CA list to support
 * corporate TLS-inspecting proxies (e.g., Netskope) that use custom root CAs.
 */

import * as fs from 'node:fs';
import * as tls from 'node:tls';

/**
 * Extended TLS interface with system CA support (Node.js 22+)
 */
interface TlsWithSystemCA {
  rootCertificates: string[];
  getCACertificates?: (type: 'system' | 'default') => string[];
  setDefaultCACertificates?: (certificates: string[]) => void;
}

/**
 * Settings interface for certificate configuration.
 */
export interface CertificateSettings {
  /** Whether to use system CA certificates (default: true) */
  useSystemCAs?: boolean;
  /** Optional custom CA bundle path (NODE_EXTRA_CA_CERTS equivalent) */
  customCAPath?: string;
}

/**
 * Merges system CA certificates with Node's bundled CA list.
 *
 * This function attempts to retrieve system CA certificates and merge them
 * with Node's default CA bundle. It includes version checking and graceful
 * fallback for older Node versions that don't support system CA retrieval.
 *
 * @param settings - Optional certificate settings
 * @returns void - Modifies global TLS configuration
 */
export function setupSystemCAs(settings: CertificateSettings = {}): void {
  const { useSystemCAs = true } = settings;

  // If explicitly disabled, do nothing
  if (!useSystemCAs) {
    console.log('System CA certificates disabled by settings');
    return;
  }

  const tlsExt = tls as unknown as TlsWithSystemCA;
  const supportsSystemCA =
    typeof tlsExt.getCACertificates === 'function' &&
    typeof tlsExt.setDefaultCACertificates === 'function';

  if (!supportsSystemCA) {
    console.warn(
      'System CA trust not supported on this Node version, skipping. ' +
        'Required functions: getCACertificates and setDefaultCACertificates'
    );
    return;
  }

  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

  if (majorVersion < 22) {
    console.warn(
      `Node.js ${nodeVersion} does not support system CA certificates. ` +
        'System CA merging skipped. Minimum required: Node.js 22.0.0'
    );
    return;
  }

  try {
    const systemCAs = tlsExt.getCACertificates!('system');

    if (!systemCAs || systemCAs.length === 0) {
      console.log('No system CA certificates found');
      return;
    }

    const nodeCAs = tlsExt.getCACertificates!('default');

    const caSet = new Set([...nodeCAs, ...systemCAs]);
    const mergedCAs = Array.from(caSet);

    tlsExt.setDefaultCACertificates!(mergedCAs);

    console.log(
      `Merged ${systemCAs.length} system CA certificates with ${nodeCAs.length} Node certificates ` +
        `(total: ${mergedCAs.length})`
    );
  } catch (error) {
    console.error('Failed to merge system CA certificates:', error);
  }
}

/**
 * Loads custom CA certificates from a file.
 *
 * @param caPath - Path to the custom CA bundle file
 * @returns Array of CA certificate strings or empty array on error
 */
export function loadCustomCAs(caPath: string): string[] {
  try {
    const caContent = fs.readFileSync(caPath, 'utf8');
    // Split by common CA bundle delimiters
    const caCerts = caContent
      .split(/-----END CERTIFICATE-----/)
      .filter(cert => cert.trim().length > 0)
      .map(cert => cert.trim() + '\n-----END CERTIFICATE-----');
    return caCerts;
  } catch (error) {
    console.error(`Failed to load custom CA certificates from ${caPath}:`, error);
    return [];
  }
}

/**
 * Sets up custom CA certificates from a file.
 *
 * @param caPath - Path to the custom CA bundle file
 * @returns void - Modifies global TLS configuration
 */
export function setupCustomCAs(caPath: string): void {
  const tlsExt = tls as unknown as TlsWithSystemCA;

  if (typeof tlsExt.setDefaultCACertificates !== 'function') {
    console.warn('setDefaultCACertificates not available, cannot add custom CA certificates');
    return;
  }

  const customCAs = loadCustomCAs(caPath);

  if (customCAs.length === 0) {
    console.warn(`No custom CA certificates loaded from ${caPath}`);
    return;
  }

  try {
    const currentCAs =
      typeof tlsExt.getCACertificates === 'function'
        ? tlsExt.getCACertificates('default')
        : tlsExt.rootCertificates;
    const caSet = new Set([...currentCAs, ...customCAs]);
    const mergedCAs = Array.from(caSet);

    tlsExt.setDefaultCACertificates!(mergedCAs);

    console.log(`Added ${customCAs.length} custom CA certificates (total: ${mergedCAs.length})`);
  } catch (error) {
    console.error('Failed to add custom CA certificates:', error);
  }
}

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

import fs from 'node:fs';

/** Protocol scheme used when product metadata does not provide a valid override. */
const DEFAULT_PROTOCOL_SCHEME = 'headlamp';
const VALID_PROTOCOL_SCHEME = /^[a-z][a-z0-9+.-]*$/i;

/**
 * Gets a normalized custom protocol scheme from product metadata.
 *
 * The scheme is read from `product.protocols.schemes`, which is the same field
 * `applyProductMetadata` hands to Electron Builder to register the scheme with
 * the OS at packaging time. Reading a separate key here would let the runtime
 * and the installer disagree, which rejects every real deep link.
 *
 * Only the first scheme is honored. Electron Builder can register several
 * aliases with the OS, but the renderer is handed a single scheme, so a deep
 * link arriving via a later alias is rejected as an invalid URL.
 *
 * @param buildManifest - Parsed product build manifest.
 * @returns The configured protocol scheme, or the Headlamp default.
 */
export function getProtocolScheme(buildManifest: unknown): string {
  const product = isRecord(buildManifest) ? buildManifest.product : undefined;
  const protocols = isRecord(product) ? product.protocols : undefined;
  const schemes = isRecord(protocols) ? protocols.schemes : undefined;
  const scheme = Array.isArray(schemes) ? schemes[0] : undefined;

  return typeof scheme === 'string' && VALID_PROTOCOL_SCHEME.test(scheme)
    ? scheme.toLowerCase()
    : DEFAULT_PROTOCOL_SCHEME;
}

/**
 * Narrows a value to a plain object usable for keyed lookups.
 *
 * @param value - Candidate value from parsed JSON.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a custom protocol scheme from a product build manifest.
 *
 * @param manifestPath - Path to the JSON product build manifest.
 * @returns The configured protocol scheme, or the Headlamp default.
 */
export function readProtocolScheme(manifestPath: string): string {
  try {
    return getProtocolScheme(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  } catch {
    return DEFAULT_PROTOCOL_SCHEME;
  }
}

/**
 * Checks whether a value is a routable URL for the configured protocol scheme.
 *
 * Opaque URLs such as `headlamp:cluster` are rejected: deep links are routed
 * from the host component, so an empty host would silently navigate to the
 * app root instead of the requested route.
 *
 * @param value - Candidate deep-link URL.
 * @param protocolScheme - Expected protocol scheme without a trailing colon.
 * @returns Whether the URL uses the configured protocol scheme and has a host.
 */
export function isProtocolUrl(value: string, protocolScheme: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === `${protocolScheme}:` && url.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Finds the first URL for the configured protocol in a process command line.
 *
 * @param commandLine - Process arguments supplied at startup or by Electron.
 * @param protocolScheme - Expected protocol scheme without a trailing colon.
 * @returns The first matching protocol URL, if one is present.
 */
export function findProtocolUrl(
  commandLine: readonly string[],
  protocolScheme: string
): string | undefined {
  return commandLine.find(value => isProtocolUrl(value, protocolScheme));
}

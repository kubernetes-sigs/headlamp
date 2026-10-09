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

/*
 * Validation helpers for the Endpoints create form, mirroring the Kubernetes API server.
 * Kept out of CreateEndpointsForm so the Resource barrel doesn't expose them to plugins.
 */

/** A port row is valid only with an integer port in the Kubernetes 1-65535 range. */
function isValidPort(port: unknown): boolean {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Parses a dotted-quad IPv4 string into its four octets, or null if malformed. */
function parseIPv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    octets.push(octet);
  }
  return octets;
}

/** Parses an IPv6 string into its eight 16-bit groups, or null if malformed. */
function parseIPv6(value: string): number[] | null {
  // Zone identifiers (e.g. fe80::1%eth0) are not valid endpoint addresses.
  if (value.includes('%')) {
    return null;
  }
  const halves = value.split('::');
  if (halves.length > 2) {
    return null;
  }

  const parseGroups = (segment: string): number[] | null => {
    if (segment === '') {
      return [];
    }
    const groups: number[] = [];
    const tokens = segment.split(':');
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // An embedded IPv4 tail (only allowed as the final token) counts as two groups.
      if (token.includes('.')) {
        if (i !== tokens.length - 1) {
          return null;
        }
        const v4 = parseIPv4(token);
        if (!v4) {
          return null;
        }
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(token)) {
        return null;
      }
      groups.push(parseInt(token, 16));
    }
    return groups;
  };

  if (halves.length === 2) {
    if (halves[0].includes('.')) {
      return null;
    }
    const head = parseGroups(halves[0]);
    const tail = parseGroups(halves[1]);
    if (!head || !tail) {
      return null;
    }
    const missing = 8 - head.length - tail.length;
    // "::" must stand in for at least one zero group.
    if (missing < 1) {
      return null;
    }
    return [...head, ...new Array(missing).fill(0), ...tail];
  }

  const groups = parseGroups(value);
  if (!groups || groups.length !== 8) {
    return null;
  }
  return groups;
}

/** Whether an IPv6 address is IPv4-mapped (::ffff:0:0/96, e.g. ::ffff:a.b.c.d). */
function isIPv4MappedIPv6(groups: number[]): boolean {
  return groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff;
}

/** Why an endpoint IP is rejected by the API server. */
export type EndpointIPIssue =
  | 'malformed'
  | 'ipv4-mapped'
  | 'unspecified'
  | 'loopback'
  | 'link-local'
  | 'link-local-multicast';

/** The range an IPv4 address falls in that the API server rejects for Endpoints, if any. */
function getSpecialIPv4Issue(octets: number[]): EndpointIPIssue | null {
  const [a, b, c] = octets;
  if (octets.every(octet => octet === 0)) return 'unspecified'; // 0.0.0.0
  if (a === 127) return 'loopback'; // 127.0.0.0/8
  if (a === 169 && b === 254) return 'link-local'; // 169.254.0.0/16
  if (a === 224 && b === 0 && c === 0) return 'link-local-multicast'; // 224.0.0.0/24
  return null;
}

/** The range an IPv6 address falls in that the API server rejects for Endpoints, if any. */
function getSpecialIPv6Issue(groups: number[]): EndpointIPIssue | null {
  if (groups.every(group => group === 0)) return 'unspecified'; // ::
  if (groups.slice(0, 7).every(group => group === 0) && groups[7] === 1) return 'loopback'; // ::1
  if ((groups[0] & 0xffc0) === 0xfe80) return 'link-local'; // fe80::/10
  // Any multicast flags (ff00::/8) with link-local scope (low nibble 2): ffx2::, e.g. ff02::, ff12::.
  if ((groups[0] & 0xff0f) === 0xff02) return 'link-local-multicast';
  return null;
}

/**
 * Mirrors the Kubernetes API server's endpoint address validation and reports why a value is
 * rejected: it must be a well-formed IPv4/IPv6 address that is not IPv4-mapped IPv6 and not in
 * a range the API server rejects for Endpoints (unspecified, loopback, or link-local
 * unicast/multicast). Returns null when the address is accepted.
 *
 * See k8s.io/kubernetes/pkg/apis/core/validation `validateEndpointAddress`, which applies
 * `IsValidIPForLegacyField` (strict by default since Kubernetes 1.36) and `ValidateEndpointIP`.
 */
export function getEndpointIPIssue(value: string): EndpointIPIssue | null {
  const ipv4 = parseIPv4(value);
  if (ipv4) {
    return getSpecialIPv4Issue(ipv4);
  }
  const ipv6 = parseIPv6(value);
  if (ipv6) {
    // Strict IP validation (StrictIPCIDRValidation) rejects IPv4-mapped IPv6 addresses outright.
    if (isIPv4MappedIPv6(ipv6)) {
      return 'ipv4-mapped';
    }
    return getSpecialIPv6Issue(ipv6);
  }
  return 'malformed';
}

/** Whether the API server accepts `value` as an endpoint address IP. */
export function isValidEndpointIP(value: string): boolean {
  return getEndpointIPIssue(value) === null;
}

const DNS1123_LABEL_MAX_LENGTH = 63;
const DNS1123_LABEL_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const DNS1123_SUBDOMAIN_MAX_LENGTH = 253;
const DNS1123_SUBDOMAIN_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const QUALIFIED_NAME_MAX_LENGTH = 63;
const QUALIFIED_NAME_REGEX = /^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/;

/** A DNS-1123 label: lowercase alphanumerics or '-', alphanumeric at both ends, max 63 chars. */
function isDNS1123Label(value: string): boolean {
  return value.length <= DNS1123_LABEL_MAX_LENGTH && DNS1123_LABEL_REGEX.test(value);
}

/**
 * Mirrors the Kubernetes API server's endpoint hostname validation: the value must be a
 * DNS-1123 label (lowercase alphanumerics or '-', starting and ending with an alphanumeric,
 * at most 63 characters).
 *
 * See k8s.io/kubernetes/pkg/apis/core/validation `validateEndpointAddress`.
 */
export function isValidEndpointHostname(value: string): boolean {
  return isDNS1123Label(value);
}

/**
 * Mirrors Kubernetes' qualified-name validation (used for `appProtocol`): an optional
 * DNS-1123 subdomain prefix followed by '/', then a name of at most 63 characters made of
 * alphanumerics, '-', '_' or '.', starting and ending with an alphanumeric.
 *
 * See k8s.io/apimachinery/pkg/util/validation `IsQualifiedName`.
 */
export function isValidQualifiedName(value: string): boolean {
  const parts = value.split('/');
  if (parts.length > 2) {
    return false;
  }
  if (parts.length === 2) {
    const prefix = parts[0];
    if (
      prefix.length === 0 ||
      prefix.length > DNS1123_SUBDOMAIN_MAX_LENGTH ||
      !DNS1123_SUBDOMAIN_REGEX.test(prefix)
    ) {
      return false;
    }
  }
  const name = parts[parts.length - 1];
  return name.length <= QUALIFIED_NAME_MAX_LENGTH && QUALIFIED_NAME_REGEX.test(name);
}

/**
 * An address row is valid only when it carries an `ip` the API server accepts for Endpoints
 * and, if a `hostname` is set, that hostname is a valid DNS-1123 label.
 */
function isValidAddress(address: unknown): boolean {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return false;
  }
  const { ip, hostname, nodeName } = address as {
    ip?: unknown;
    hostname?: unknown;
    nodeName?: unknown;
  };
  if (typeof ip !== 'string' || !isValidEndpointIP(ip)) {
    return false;
  }
  if (
    nodeName !== undefined &&
    nodeName !== null &&
    (typeof nodeName !== 'string' ||
      nodeName.length > DNS1123_SUBDOMAIN_MAX_LENGTH ||
      !DNS1123_SUBDOMAIN_REGEX.test(nodeName))
  ) {
    return false;
  }
  // An empty or missing hostname is optional; anything else must be a DNS-1123 label.
  if (hostname === undefined || hostname === null || hostname === '') {
    return true;
  }
  return typeof hostname === 'string' && isValidEndpointHostname(hostname);
}

/**
 * Mirrors the Kubernetes API server's endpoint port validation: the port number must be in
 * range, a non-empty `name` must be a DNS-1123 label (and is required when `requireName`),
 * and a set `appProtocol` must be a qualified name.
 *
 * See k8s.io/kubernetes/pkg/apis/core/validation `validateEndpointPort`.
 */
function isValidEndpointPort(port: unknown, requireName: boolean): boolean {
  if (!port || typeof port !== 'object' || Array.isArray(port)) {
    return false;
  }
  const {
    name,
    appProtocol,
    port: portNumber,
    protocol,
  } = port as {
    name?: unknown;
    appProtocol?: unknown;
    port?: unknown;
    protocol?: unknown;
  };
  if (!isValidPort(portNumber)) {
    return false;
  }
  if (name === undefined || name === null || name === '') {
    if (requireName) {
      return false;
    }
  } else if (typeof name !== 'string' || !isDNS1123Label(name)) {
    return false;
  }
  if (
    protocol !== undefined &&
    protocol !== null &&
    protocol !== '' &&
    (typeof protocol !== 'string' || !['TCP', 'UDP', 'SCTP'].includes(protocol))
  ) {
    return false;
  }
  // appProtocol is optional, but once set (even to '') the API server validates it.
  if (appProtocol !== undefined && appProtocol !== null) {
    return typeof appProtocol === 'string' && isValidQualifiedName(appProtocol);
  }
  return true;
}

/**
 * A subset is valid when it declares at least one address (ready or not-ready),
 * every present address has a valid IP (and hostname, if set), and every present port passes
 * the API server's port checks (number, name, and appProtocol).
 */
function isValidSubset(subset: unknown): boolean {
  if (!subset || typeof subset !== 'object' || Array.isArray(subset)) {
    return false;
  }
  const { addresses, notReadyAddresses, ports } = subset as {
    addresses?: unknown;
    notReadyAddresses?: unknown;
    ports?: unknown;
  };
  if (
    (addresses !== undefined && addresses !== null && !Array.isArray(addresses)) ||
    (notReadyAddresses !== undefined &&
      notReadyAddresses !== null &&
      !Array.isArray(notReadyAddresses)) ||
    (ports !== undefined && ports !== null && !Array.isArray(ports))
  ) {
    return false;
  }
  const readyAddresses = Array.isArray(addresses) ? addresses : [];
  const notReady = Array.isArray(notReadyAddresses) ? notReadyAddresses : [];
  // Kubernetes rejects a subset that has neither addresses nor notReadyAddresses.
  if (readyAddresses.length === 0 && notReady.length === 0) {
    return false;
  }
  // Every present address (ready or not-ready) must have a valid IP and optional hostname.
  if (![...readyAddresses, ...notReady].every(isValidAddress)) {
    return false;
  }
  // Every present port must be valid; names are required once there is more than one port.
  const portList = Array.isArray(ports) ? ports : [];
  return portList.every(port => isValidEndpointPort(port, portList.length > 1));
}

/** Validates the `subsets` field: a non-empty list of valid subsets. */
export function areSubsetsValid(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isValidSubset);
}

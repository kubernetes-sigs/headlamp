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
 * Validation helpers for the EndpointSlice create form, mirroring the Kubernetes API server
 * (k8s.io/kubernetes/pkg/apis/discovery/validation and the discovery/v1 declarative tags).
 * Kept out of CreateEndpointSliceForm so the Resource barrel doesn't expose them to plugins.
 */

import {
  type EndpointIPIssue,
  getEndpointIPIssue,
  isDNS1123Label,
  isDNS1123Subdomain,
  isValidQualifiedName,
} from '../endpoints/endpointsValidation';

export const ENDPOINT_SLICE_ADDRESS_TYPES = ['IPv4', 'IPv6', 'FQDN'] as const;
export type EndpointSliceAddressType = (typeof ENDPOINT_SLICE_ADDRESS_TYPES)[number];

/** Label linking an EndpointSlice to the Service it belongs to. */
export const SERVICE_NAME_LABEL = 'kubernetes.io/service-name';

const MAX_ENDPOINTS = 1000;
export const MAX_ENDPOINT_ADDRESSES = 100;
const MAX_ENDPOINT_HINTS = 8;
const MAX_PORTS = 20000;
const SUPPORTED_PROTOCOLS = ['TCP', 'UDP', 'SCTP'];
const LABEL_VALUE_MAX_LENGTH = 63;
const LABEL_VALUE_REGEX = /^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isUnset(value: unknown): value is undefined | null {
  return value === undefined || value === null;
}

export function isValidAddressType(value: unknown): value is EndpointSliceAddressType {
  return ENDPOINT_SLICE_ADDRESS_TYPES.includes(value as EndpointSliceAddressType);
}

/**
 * Mirrors `IsFullyQualifiedDomainName`: an optional trailing dot, then a DNS-1123 subdomain
 * made of at least two DNS-1123 labels.
 *
 * See k8s.io/apimachinery/pkg/util/validation `IsFullyQualifiedDomainName`.
 */
export function isValidFQDN(value: string): boolean {
  const name = value.endsWith('.') ? value.slice(0, -1) : value;
  if (name === '' || !isDNS1123Subdomain(name)) {
    return false;
  }
  const labels = name.split('.');
  return labels.length >= 2 && labels.every(isDNS1123Label);
}

/** Mirrors `IsValidLabelValue`: empty, or at most 63 alphanumerics, '-', '_' or '.'. */
export function isValidLabelValue(value: unknown): boolean {
  if (isUnset(value)) {
    return true;
  }
  return (
    typeof value === 'string' &&
    value.length <= LABEL_VALUE_MAX_LENGTH &&
    LABEL_VALUE_REGEX.test(value)
  );
}

/** Why an EndpointSlice address is rejected for the slice's `addressType`. */
export type EndpointSliceAddressIssue = EndpointIPIssue | 'not-ipv4' | 'not-ipv6' | 'invalid-fqdn';

/**
 * Mirrors the API server's per-address check for the slice's `addressType`, in the same order:
 * IPs must parse strictly, match the address family, and not fall in a special range; FQDNs
 * must be fully qualified. Unknown address types are not validated, like the API server.
 * Returns null when the address is accepted.
 */
export function getEndpointSliceAddressIssue(
  value: string,
  addressType: unknown
): EndpointSliceAddressIssue | null {
  if (addressType === 'FQDN') {
    return isValidFQDN(value) ? null : 'invalid-fqdn';
  }
  if (addressType !== 'IPv4' && addressType !== 'IPv6') {
    return null;
  }
  const issue = getEndpointIPIssue(value);
  if (issue === 'malformed') {
    return addressType === 'IPv4' ? 'not-ipv4' : 'not-ipv6';
  }
  if (issue === 'ipv4-mapped') {
    return issue;
  }
  // Any accepted IP containing ':' is IPv6; everything else is a dotted-quad IPv4.
  const isIPv6 = value.includes(':');
  if (addressType === 'IPv4' && isIPv6) {
    return 'not-ipv4';
  }
  if (addressType === 'IPv6' && !isIPv6) {
    return 'not-ipv6';
  }
  return issue;
}

/**
 * Validates one `hints.forZones`/`hints.forNodes` list like `validateHints`: at most 8 entries
 * whose names are unique and accepted by `isValidName`. An omitted name decodes to "".
 */
function areHintNamesValid(value: unknown, isValidName: (name: string) => boolean): boolean {
  if (isUnset(value)) {
    return true;
  }
  if (!Array.isArray(value) || value.length > MAX_ENDPOINT_HINTS) {
    return false;
  }
  const seenNames: string[] = [];
  return value.every(hint => {
    if (!isPlainObject(hint)) {
      return false;
    }
    const name = hint.name ?? '';
    if (typeof name !== 'string' || seenNames.includes(name) || !isValidName(name)) {
      return false;
    }
    seenNames.push(name);
    return true;
  });
}

/** Zone hints must be label values (empty allowed); node hints must be valid node names. */
function areEndpointHintsValid(hints: unknown): boolean {
  if (isUnset(hints)) {
    return true;
  }
  return (
    isPlainObject(hints) &&
    areHintNamesValid(hints.forZones, isValidLabelValue) &&
    areHintNamesValid(hints.forNodes, isDNS1123Subdomain)
  );
}

/**
 * An endpoint needs 1-100 addresses valid for `addressType`. A set hostname must be a
 * DNS-1123 label and a set nodeName a DNS-1123 subdomain. Set hints must be valid.
 */
function isValidEndpoint(endpoint: unknown, addressType: unknown): boolean {
  if (!isPlainObject(endpoint)) {
    return false;
  }
  const { addresses, hostname, nodeName, zone, conditions, hints } = endpoint;
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.length > MAX_ENDPOINT_ADDRESSES ||
    !addresses.every(
      address =>
        typeof address === 'string' && getEndpointSliceAddressIssue(address, addressType) === null
    )
  ) {
    return false;
  }
  if (!isUnset(hostname) && (typeof hostname !== 'string' || !isDNS1123Label(hostname))) {
    return false;
  }
  if (!isUnset(nodeName) && (typeof nodeName !== 'string' || !isDNS1123Subdomain(nodeName))) {
    return false;
  }
  if (!isUnset(zone) && typeof zone !== 'string') {
    return false;
  }
  if (!areEndpointHintsValid(hints)) {
    return false;
  }
  if (isUnset(conditions)) {
    return true;
  }
  return (
    isPlainObject(conditions) &&
    ['ready', 'serving', 'terminating'].every(
      key => isUnset(conditions[key]) || typeof conditions[key] === 'boolean'
    )
  );
}

/** Validates the optional `endpoints` list: at most 1000 valid endpoints. */
export function areEndpointSliceEndpointsValid(value: unknown, addressType: unknown): boolean {
  if (isUnset(value)) {
    return true;
  }

  return (
    Array.isArray(value) &&
    value.length <= MAX_ENDPOINTS &&
    value.every(endpoint => isValidEndpoint(endpoint, addressType))
  );
}

/**
 * Validates the optional `ports` list like `validatePorts`: names are optional DNS-1123 labels
 * but must be unique (an unset name counts as ""), protocol must be TCP, UDP or SCTP when set,
 * and a set appProtocol must be a qualified name. A set port number must be 1-65535.
 */
export function areEndpointSlicePortsValid(value: unknown): boolean {
  if (isUnset(value)) {
    return true;
  }
  if (!Array.isArray(value) || value.length > MAX_PORTS) {
    return false;
  }
  const seenNames: string[] = [];
  return value.every(port => {
    if (!isPlainObject(port)) {
      return false;
    }
    const { port: portNumber, protocol, appProtocol } = port;
    const name = port.name ?? '';
    if (typeof name !== 'string' || (name !== '' && !isDNS1123Label(name))) {
      return false;
    }
    if (seenNames.includes(name)) {
      return false;
    }
    seenNames.push(name);
    if (
      !isUnset(portNumber) &&
      !(
        typeof portNumber === 'number' &&
        Number.isInteger(portNumber) &&
        portNumber >= 1 &&
        portNumber <= 65535
      )
    ) {
      return false;
    }
    if (!isUnset(protocol) && !SUPPORTED_PROTOCOLS.includes(protocol as string)) {
      return false;
    }
    return (
      isUnset(appProtocol) || (typeof appProtocol === 'string' && isValidQualifiedName(appProtocol))
    );
  });
}

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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type {
  KubeEndpoint,
  KubeEndpointAddress,
  KubeEndpointPort,
  KubeEndpointSubset,
} from '../../lib/k8s/endpoints';
import { useId } from '../../lib/util';
import CreateResourceForm, {
  FormSection,
  FormTextField,
  metadataSection,
} from '../common/Resource/CreateResourceForm';

/** An Endpoints object can stay incomplete while the user fills out the form. */
export type EndpointsDraft = RecursivePartial<KubeEndpoint>;

export interface CreateEndpointsFormProps {
  resource?: EndpointsDraft;
  onChange: (resource: EndpointsDraft) => void;
  onValidChange?: (valid: boolean) => void;
}

const EMPTY_ENDPOINTS_DRAFT: EndpointsDraft = {};

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

/** Returns the embedded IPv4 octets of an IPv4-mapped IPv6 address (::ffff:a.b.c.d), else null. */
function ipv6MappedToIPv4(groups: number[]): number[] | null {
  const prefixIsZero = groups.slice(0, 5).every(group => group === 0);
  if (prefixIsZero && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
  }
  return null;
}

/** Whether an IPv4 address is in a range the API server rejects for Endpoints. */
function isSpecialIPv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  const unspecified = octets.every(octet => octet === 0); // 0.0.0.0
  const loopback = a === 127; // 127.0.0.0/8
  const linkLocalUnicast = a === 169 && b === 254; // 169.254.0.0/16
  const linkLocalMulticast = a === 224 && b === 0 && c === 0; // 224.0.0.0/24
  return unspecified || loopback || linkLocalUnicast || linkLocalMulticast;
}

/** Whether an IPv6 address is in a range the API server rejects for Endpoints. */
function isSpecialIPv6(groups: number[]): boolean {
  const unspecified = groups.every(group => group === 0); // ::
  const loopback = groups.slice(0, 7).every(group => group === 0) && groups[7] === 1; // ::1
  const linkLocalUnicast = (groups[0] & 0xffc0) === 0xfe80; // fe80::/10
  const linkLocalMulticast = (groups[0] & 0xff0f) === 0xff02; // ff02::/16 low nibble
  return unspecified || loopback || linkLocalUnicast || linkLocalMulticast;
}

/**
 * Mirrors the Kubernetes API server's endpoint address validation: the value must be a
 * well-formed IPv4/IPv6 address that is not in a range the API server rejects for Endpoints
 * (unspecified, loopback, or link-local unicast/multicast).
 *
 * See k8s.io/kubernetes/pkg/apis/core/validation `validateNonSpecialIP`.
 */
export function isValidEndpointIP(value: string): boolean {
  const ipv4 = parseIPv4(value);
  if (ipv4) {
    return !isSpecialIPv4(ipv4);
  }
  const ipv6 = parseIPv6(value);
  if (ipv6) {
    const mapped = ipv6MappedToIPv4(ipv6);
    if (mapped) {
      return !isSpecialIPv4(mapped);
    }
    return !isSpecialIPv6(ipv6);
  }
  return false;
}

/** An address row is valid only when it carries an `ip` the API server accepts for Endpoints. */
function isValidAddress(address: unknown): boolean {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return false;
  }
  const ip = (address as { ip?: unknown }).ip;
  return typeof ip === 'string' && isValidEndpointIP(ip);
}

/**
 * A subset is valid when it declares at least one address (ready or not-ready),
 * every present address has a valid IP, and every present port is in range.
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
  const readyAddresses = Array.isArray(addresses) ? addresses : [];
  const notReady = Array.isArray(notReadyAddresses) ? notReadyAddresses : [];
  // Kubernetes rejects a subset that has neither addresses nor notReadyAddresses.
  if (readyAddresses.length === 0 && notReady.length === 0) {
    return false;
  }
  // Every present address (ready or not-ready) must have a valid IP.
  if (![...readyAddresses, ...notReady].every(isValidAddress)) {
    return false;
  }
  // Every present port must have a valid port number.
  const portList = Array.isArray(ports) ? ports : [];
  return (
    portList.every(port => isValidPort((port as { port?: unknown })?.port)) &&
    (portList.length <= 1 ||
      portList.every(
        port =>
          typeof (port as { name?: unknown })?.name === 'string' &&
          (port as { name: string }).name.trim().length > 0
      ))
  );
}

/** Validates the `subsets` field: a non-empty list of valid subsets. */
export function areSubsetsValid(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isValidSubset);
}

type EndpointSubsetDraft = RecursivePartial<KubeEndpointSubset>;
type EndpointAddressDraft = RecursivePartial<KubeEndpointAddress>;
type EndpointPortDraft = RecursivePartial<KubeEndpointPort>;
type EndpointSubsetsDraft = NonNullable<EndpointsDraft['subsets']>;
type EndpointAddressesDraft = NonNullable<EndpointSubsetDraft['addresses']>;
type EndpointPortsDraft = NonNullable<EndpointSubsetDraft['ports']>;

export default function CreateEndpointsForm(props: CreateEndpointsFormProps) {
  const { resource = EMPTY_ENDPOINTS_DRAFT, onChange, onValidChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const sections: FormSection[] = [
    metadataSection(t),
    {
      title: t('translation|Subsets'),
      fields: [
        {
          key: 'subsets',
          path: 'subsets',
          label: t('translation|Subsets'),
          helperText: t('translation|Groups of addresses and ports that share a set of endpoints.'),
          required: true,
          validate: areSubsetsValid,
          render: ({ value, onChange: onSubsetsChange }) => (
            <EndpointSubsetsField value={value} onChange={onSubsetsChange} />
          ),
        },
      ],
    },
  ];

  return (
    <CreateResourceForm
      sections={sections}
      resource={resource as Record<string, any>}
      onChange={onChange as (resource: Record<string, any>) => void}
      onValidChange={onValidChange}
    />
  );
}

export interface EndpointSubsetsFieldProps {
  value: EndpointsDraft['subsets'];
  onChange: (subsets: EndpointSubsetsDraft) => void;
}

/** Edits the address and port groups in an Endpoints resource. */
export function EndpointSubsetsField(props: EndpointSubsetsFieldProps) {
  const { value, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const subsets: EndpointSubsetsDraft = Array.isArray(value) ? value : [];
  const baseId = useId('endpoint-subsets-');

  function updateSubset(index: number, next: EndpointSubsetDraft) {
    onChange(subsets.map((subset, subsetIndex) => (subsetIndex === index ? next : subset)));
  }

  function addSubset() {
    onChange([
      ...subsets,
      {
        addresses: [{ hostname: '', ip: '' }],
        ports: [{ name: '', appProtocol: 'http', port: 80, protocol: 'TCP' }],
      },
    ]);
  }

  function removeSubset(index: number) {
    onChange(subsets.filter((_subset, subsetIndex) => subsetIndex !== index));
  }

  return (
    <Box>
      {subsets.map((subset, index) => {
        const safeSubset: EndpointSubsetDraft =
          subset && typeof subset === 'object' && !Array.isArray(subset) ? subset : {};
        const subsetLabelId = `${baseId}-subset-${index}`;
        const addressesLabelId = `${subsetLabelId}-addresses`;
        const notReadyLabelId = `${subsetLabelId}-not-ready`;
        const portsLabelId = `${subsetLabelId}-ports`;
        const subsetLabel = t('translation|Subset {{ number }}', { number: index + 1 });
        return (
          <Box
            key={index}
            role="group"
            aria-labelledby={subsetLabelId}
            sx={theme => ({
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              p: 2,
              mb: 2,
            })}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography id={subsetLabelId} variant="subtitle2">
                {subsetLabel}
              </Typography>
              <IconButton
                aria-label={t('translation|Remove subset')}
                onClick={() => removeSubset(index)}
              >
                <Icon icon="mdi:close-circle" width={24} height={24} />
              </IconButton>
            </Box>
            <EndpointAddressesField
              title={t('translation|Addresses')}
              addLabel={t('translation|New Address')}
              removeLabel={t('translation|Remove address')}
              subsetLabel={subsetLabel}
              subsetLabelId={subsetLabelId}
              titleId={addressesLabelId}
              value={safeSubset.addresses}
              onChange={addresses => updateSubset(index, { ...safeSubset, addresses })}
            />
            <EndpointAddressesField
              title={t('translation|Not Ready Addresses')}
              addLabel={t('translation|New Not Ready Address')}
              removeLabel={t('translation|Remove not ready address')}
              subsetLabel={subsetLabel}
              subsetLabelId={subsetLabelId}
              titleId={notReadyLabelId}
              value={safeSubset.notReadyAddresses}
              onChange={notReadyAddresses =>
                updateSubset(index, { ...safeSubset, notReadyAddresses })
              }
            />
            <EndpointPortsField
              subsetLabel={subsetLabel}
              subsetLabelId={subsetLabelId}
              titleId={portsLabelId}
              value={safeSubset.ports}
              onChange={ports => updateSubset(index, { ...safeSubset, ports })}
            />
          </Box>
        );
      })}
      <Button size="small" onClick={addSubset} aria-label={t('translation|Add subset')}>
        <Icon icon="mdi:plus-circle" width={24} height={24} />
        <Typography variant="body2" sx={{ ml: 0.5 }}>
          {t('translation|New Subset')}
        </Typography>
      </Button>
    </Box>
  );
}

interface EndpointAddressesFieldProps {
  title: string;
  addLabel: string;
  removeLabel: string;
  /** Human-readable subset label (e.g. "Subset 1") prepended to control names. */
  subsetLabel: string;
  /** Id of the enclosing subset heading, prepended to this group's label. */
  subsetLabelId: string;
  /** Id assigned to this group's own title, used as its accessible name. */
  titleId: string;
  value: EndpointSubsetDraft['addresses'];
  onChange: (addresses: EndpointAddressesDraft) => void;
}

function EndpointAddressesField(props: EndpointAddressesFieldProps) {
  const { title, addLabel, removeLabel, subsetLabel, subsetLabelId, titleId, value, onChange } =
    props;
  const { t } = useTranslation(['translation', 'glossary']);
  const addresses: EndpointAddressesDraft = Array.isArray(value) ? value : [];

  function updateAddress(index: number, field: keyof EndpointAddressDraft, rawValue: string) {
    const nextAddresses = addresses.map(address =>
      address && typeof address === 'object' && !Array.isArray(address) ? { ...address } : {}
    );
    const nextAddress = nextAddresses[index];
    if (rawValue === '') {
      delete nextAddress[field];
    } else {
      (nextAddress as Record<string, string>)[field] = rawValue;
    }
    onChange(nextAddresses);
  }

  function addAddress() {
    onChange([...addresses, { hostname: '', ip: '' }]);
  }

  function removeAddress(index: number) {
    onChange(addresses.filter((_address, addressIndex) => addressIndex !== index));
  }

  return (
    <Box sx={{ mt: 2 }} role="group" aria-labelledby={`${subsetLabelId} ${titleId}`}>
      <Typography id={titleId} variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
        {title}
      </Typography>
      {addresses.map((address, index) => (
        <Box
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
            gap: 1,
            alignItems: 'center',
            mb: 1,
          }}
        >
          <FormTextField
            label={t('translation|Hostname')}
            inputProps={{
              'aria-label': `${subsetLabel} ${title} ${index + 1} ${t('translation|Hostname')}`,
            }}
            value={address?.hostname ?? ''}
            onChange={event => updateAddress(index, 'hostname', event.target.value)}
          />
          <FormTextField
            label={t('translation|IP')}
            inputProps={{
              'aria-label': `${subsetLabel} ${title} ${index + 1} ${t('translation|IP')}`,
            }}
            value={address?.ip ?? ''}
            onChange={event => updateAddress(index, 'ip', event.target.value)}
          />
          <IconButton aria-label={removeLabel} onClick={() => removeAddress(index)}>
            <Icon icon="mdi:close-circle" width={24} height={24} />
          </IconButton>
        </Box>
      ))}
      <Button size="small" onClick={addAddress} aria-label={addLabel}>
        <Icon icon="mdi:plus-circle" width={24} height={24} />
        <Typography variant="body2" sx={{ ml: 0.5 }}>
          {addLabel}
        </Typography>
      </Button>
    </Box>
  );
}

interface EndpointPortsFieldProps {
  /** Human-readable subset label (e.g. "Subset 1") prepended to control names. */
  subsetLabel: string;
  /** Id of the enclosing subset heading, prepended to this group's label. */
  subsetLabelId: string;
  /** Id assigned to this group's own title, used as its accessible name. */
  titleId: string;
  value: EndpointSubsetDraft['ports'];
  onChange: (ports: EndpointPortsDraft) => void;
}

function EndpointPortsField(props: EndpointPortsFieldProps) {
  const { subsetLabel, subsetLabelId, titleId, value, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const ports: EndpointPortsDraft = Array.isArray(value) ? value : [];
  const portsTitle = t('translation|Ports');

  function updatePort(index: number, field: keyof EndpointPortDraft, rawValue: string) {
    const nextPorts = ports.map(port =>
      port && typeof port === 'object' && !Array.isArray(port) ? { ...port } : {}
    );
    const nextPort = nextPorts[index];
    if (rawValue === '') {
      delete nextPort[field];
    } else if (field === 'port') {
      const numberValue = Number(rawValue);
      if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 65535) return;
      nextPort[field] = numberValue as never;
    } else {
      (nextPort as Record<string, string>)[field] = rawValue;
    }
    onChange(nextPorts);
  }

  function addPort() {
    onChange([...ports, { name: '', appProtocol: 'http', port: 80, protocol: 'TCP' }]);
  }

  function removePort(index: number) {
    onChange(ports.filter((_port, portIndex) => portIndex !== index));
  }

  return (
    <Box sx={{ mt: 2 }} role="group" aria-labelledby={`${subsetLabelId} ${titleId}`}>
      <Typography id={titleId} variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
        {portsTitle}
      </Typography>
      {ports.map((port, index) => (
        <Box
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr auto' },
            gap: 1,
            alignItems: 'center',
            mb: 1,
          }}
        >
          <FormTextField
            label={t('translation|Name')}
            inputProps={{
              'aria-label': `${subsetLabel} ${portsTitle} ${index + 1} ${t('translation|Name')}`,
            }}
            value={port?.name ?? ''}
            onChange={event => updatePort(index, 'name', event.target.value)}
          />
          <FormTextField
            label={t('translation|App Protocol')}
            inputProps={{
              'aria-label': `${subsetLabel} ${portsTitle} ${index + 1} ${t(
                'translation|App Protocol'
              )}`,
            }}
            value={port?.appProtocol ?? ''}
            onChange={event => updatePort(index, 'appProtocol', event.target.value)}
          />
          <FormTextField
            label={t('translation|Port')}
            type="number"
            value={port?.port ?? ''}
            onChange={event => updatePort(index, 'port', event.target.value)}
            inputProps={{
              min: 1,
              max: 65535,
              'aria-label': `${subsetLabel} ${portsTitle} ${index + 1} ${t('translation|Port')}`,
            }}
          />
          <FormTextField
            label={t('translation|Protocol')}
            select
            inputProps={{
              'aria-label': `${subsetLabel} ${portsTitle} ${index + 1} ${t(
                'translation|Protocol'
              )}`,
            }}
            value={port?.protocol ?? 'TCP'}
            onChange={event => updatePort(index, 'protocol', event.target.value)}
          >
            {['TCP', 'UDP', 'SCTP'].map(protocol => (
              <MenuItem key={protocol} value={protocol}>
                {protocol}
              </MenuItem>
            ))}
          </FormTextField>
          <IconButton
            aria-label={`${t('translation|Remove port')} ${index + 1}`}
            onClick={() => removePort(index)}
          >
            <Icon icon="mdi:close-circle" width={24} height={24} />
          </IconButton>
        </Box>
      ))}
      <Button size="small" onClick={addPort} aria-label={t('translation|Add port')}>
        <Icon icon="mdi:plus-circle" width={24} height={24} />
        <Typography variant="body2" sx={{ ml: 0.5 }}>
          {t('translation|New Port')}
        </Typography>
      </Button>
    </Box>
  );
}

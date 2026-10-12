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
  KubeEndpointAddress,
  KubeEndpointPort,
  KubeEndpointSubset,
} from '../../lib/k8s/endpoints';
import { useId } from '../../lib/util';
import { FormTextField } from '../common/Resource/CreateResourceForm';
import type { EndpointsDraft } from './CreateEndpointsForm';
import { getEndpointIPIssue } from './endpointsValidation';

type EndpointSubsetDraft = RecursivePartial<KubeEndpointSubset>;
type EndpointAddressDraft = RecursivePartial<KubeEndpointAddress>;
type EndpointPortDraft = RecursivePartial<KubeEndpointPort>;
type EndpointSubsetsDraft = NonNullable<EndpointsDraft['subsets']>;
type EndpointAddressesDraft = NonNullable<EndpointSubsetDraft['addresses']>;
type EndpointPortsDraft = NonNullable<EndpointSubsetDraft['ports']>;

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
                aria-label={`${t('translation|Remove subset')} ${index + 1}`}
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

  /** Explains why a typed IP is rejected; empty IPs get no message so new rows aren't flagged. */
  function getIPErrorText(ip: unknown): string | undefined {
    if (typeof ip !== 'string' || ip === '') {
      return undefined;
    }
    switch (getEndpointIPIssue(ip)) {
      case 'malformed':
        return t('translation|Enter a valid IPv4 or IPv6 address.');
      case 'ipv4-mapped':
        return t(
          'translation|IPv4-mapped IPv6 addresses are not allowed. Use the plain IPv4 address instead.'
        );
      case 'unspecified':
        return t('translation|Unspecified addresses (0.0.0.0, ::) are not allowed for endpoints.');
      case 'loopback':
        return t(
          'translation|Loopback addresses (127.0.0.0/8, ::1) are not allowed for endpoints.'
        );
      case 'link-local':
        return t(
          'translation|Link-local addresses (169.254.0.0/16, fe80::/10) are not allowed for endpoints.'
        );
      case 'link-local-multicast':
        return t(
          'translation|Link-local multicast addresses (224.0.0.0/24, or IPv6 multicast with link-local scope, ffx2::) are not allowed for endpoints.'
        );
      default:
        return undefined;
    }
  }

  return (
    <Box sx={{ mt: 2 }} role="group" aria-labelledby={`${subsetLabelId} ${titleId}`}>
      <Typography id={titleId} variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
        {title}
      </Typography>
      {addresses.map((address, index) => {
        const ipErrorText = getIPErrorText(address?.ip);
        return (
          <Box
            key={index}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
              gap: 1,
              // Top-align so an error message under one input doesn't shift its neighbours.
              alignItems: 'start',
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
              id={`${titleId}-${index}-ip`}
              label={t('glossary|IP')}
              inputProps={{
                'aria-label': `${subsetLabel} ${title} ${index + 1} ${t('glossary|IP')}`,
              }}
              value={address?.ip ?? ''}
              onChange={event => updateAddress(index, 'ip', event.target.value)}
              error={!!ipErrorText}
              helperText={ipErrorText}
            />
            <IconButton
              aria-label={`${subsetLabel} ${title} ${index + 1} ${removeLabel}`}
              onClick={() => removeAddress(index)}
            >
              <Icon icon="mdi:close-circle" width={24} height={24} />
            </IconButton>
          </Box>
        );
      })}
      <Button size="small" onClick={addAddress} aria-label={`${subsetLabel} ${addLabel}`}>
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
  const portsTitle = t('glossary|Ports');

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
            aria-label={`${subsetLabel} ${portsTitle} ${index + 1} ${t('translation|Remove port')}`}
            onClick={() => removePort(index)}
          >
            <Icon icon="mdi:close-circle" width={24} height={24} />
          </IconButton>
        </Box>
      ))}
      <Button
        size="small"
        onClick={addPort}
        aria-label={`${subsetLabel} ${t('translation|Add port')}`}
      >
        <Icon icon="mdi:plus-circle" width={24} height={24} />
        <Typography variant="body2" sx={{ ml: 0.5 }}>
          {t('translation|New Port')}
        </Typography>
      </Button>
    </Box>
  );
}

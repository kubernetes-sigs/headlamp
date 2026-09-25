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
        return (
          <Box
            key={index}
            sx={theme => ({
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              p: 2,
              mb: 2,
            })}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2">
                {t('translation|Subset {{ number }}', { number: index + 1 })}
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
              value={safeSubset.addresses}
              onChange={addresses => updateSubset(index, { ...safeSubset, addresses })}
            />
            <EndpointAddressesField
              title={t('translation|Not Ready Addresses')}
              addLabel={t('translation|New Not Ready Address')}
              removeLabel={t('translation|Remove not ready address')}
              value={safeSubset.notReadyAddresses}
              onChange={notReadyAddresses =>
                updateSubset(index, { ...safeSubset, notReadyAddresses })
              }
            />
            <EndpointPortsField
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
  value: EndpointSubsetDraft['addresses'];
  onChange: (addresses: EndpointAddressesDraft) => void;
}

function EndpointAddressesField(props: EndpointAddressesFieldProps) {
  const { title, addLabel, removeLabel, value, onChange } = props;
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
    <Box sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
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
            value={address?.hostname ?? ''}
            onChange={event => updateAddress(index, 'hostname', event.target.value)}
          />
          <FormTextField
            label={t('translation|IP')}
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
  value: EndpointSubsetDraft['ports'];
  onChange: (ports: EndpointPortsDraft) => void;
}

function EndpointPortsField(props: EndpointPortsFieldProps) {
  const { value, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const ports: EndpointPortsDraft = Array.isArray(value) ? value : [];

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
    <Box sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
        {t('translation|Ports')}
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
            value={port?.name ?? ''}
            onChange={event => updatePort(index, 'name', event.target.value)}
          />
          <FormTextField
            label={t('translation|App Protocol')}
            value={port?.appProtocol ?? ''}
            onChange={event => updatePort(index, 'appProtocol', event.target.value)}
          />
          <FormTextField
            label={t('translation|Port')}
            type="number"
            value={port?.port ?? ''}
            onChange={event => updatePort(index, 'port', event.target.value)}
            inputProps={{ min: 1, max: 65535 }}
          />
          <FormTextField
            label={t('translation|Protocol')}
            select
            value={port?.protocol ?? 'TCP'}
            onChange={event => updatePort(index, 'protocol', event.target.value)}
          >
            {['TCP', 'UDP', 'SCTP'].map(protocol => (
              <MenuItem key={protocol} value={protocol}>
                {protocol}
              </MenuItem>
            ))}
          </FormTextField>
          <IconButton aria-label={t('translation|Remove port')} onClick={() => removePort(index)}>
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

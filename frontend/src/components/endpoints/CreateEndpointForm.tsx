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
import React from 'react';
import { useTranslation } from 'react-i18next';
import type {
  KubeEndpointAddress,
  KubeEndpointPort,
  KubeEndpointSubset,
} from '../../lib/k8s/endpoints';
import CreateResourceForm, {
  FieldLabel,
  FormSection,
  FormTextField,
} from '../common/Resource/CreateResourceForm';

const PROTOCOLS = ['TCP', 'UDP', 'SCTP'];

/** Props for {@link CreateEndpointForm}. */
export interface CreateEndpointFormProps {
  /** Current resource object from the editor/form state. */
  resource?: Record<string, any>;
  /** Called when form fields update the resource object. */
  onChange: (resource: Record<string, any>) => void;
}

let subsetIdCounter = 0;
const nextSubsetId = () => `subset-${++subsetIdCounter}`;

let addressIdCounter = 0;
const nextAddressId = () => `address-${++addressIdCounter}`;

let portIdCounter = 0;
const nextPortId = () => `port-${++portIdCounter}`;

interface AddressRow extends KubeEndpointAddress {
  _id: string;
}

interface PortRow extends KubeEndpointPort {
  _id: string;
}

interface SubsetRow {
  _id: string;
  addresses: AddressRow[];
  ports: PortRow[];
}

function subsetsToRows(subsets: KubeEndpointSubset[]): SubsetRow[] {
  return (subsets ?? []).map(s => ({
    _id: nextSubsetId(),
    addresses: (s.addresses ?? []).map(a => ({ ...a, _id: nextAddressId() })),
    ports: (s.ports ?? []).map(p => ({ ...p, _id: nextPortId() })),
  }));
}

function rowsToSubsets(rows: SubsetRow[]): KubeEndpointSubset[] {
  return rows.map(r => ({
    addresses: r.addresses.map(a => ({
      ip: a.ip,
      hostname: a.hostname,
      ...(a.nodeName ? { nodeName: a.nodeName } : {}),
    })),
    ports: r.ports.map(p => ({
      ...(p.name ? { name: p.name } : {}),
      appProtocol: p.appProtocol,
      port: p.port,
      protocol: p.protocol,
    })),
  }));
}

interface SubsetsEditorProps {
  value: KubeEndpointSubset[];
  onChange: (subsets: KubeEndpointSubset[]) => void;
}

function SubsetsEditor(props: SubsetsEditorProps) {
  const { value, onChange } = props;
  const { t } = useTranslation(['translation']);

  const [rows, setRows] = React.useState<SubsetRow[]>(() => subsetsToRows(value ?? []));
  const lastEmittedRef = React.useRef<KubeEndpointSubset[]>(rowsToSubsets(rows));

  // Re-seed rows when value changes externally (e.g. user edits YAML directly).
  // Skip the update when the change is our own echo to avoid clobbering in-progress edits.
  React.useEffect(() => {
    const incoming = value ?? [];
    if (JSON.stringify(incoming) !== JSON.stringify(lastEmittedRef.current)) {
      setRows(subsetsToRows(incoming));
      lastEmittedRef.current = incoming;
    }
  }, [value]);

  function commit(next: SubsetRow[]) {
    setRows(next);
    const subsets = rowsToSubsets(next);
    lastEmittedRef.current = subsets;
    onChange(subsets);
  }

  function addSubset() {
    commit([
      ...rows,
      {
        _id: nextSubsetId(),
        addresses: [{ _id: nextAddressId(), ip: '', hostname: '' }],
        ports: [{ _id: nextPortId(), name: '', appProtocol: 'http', port: 80, protocol: 'TCP' }],
      },
    ]);
  }

  function removeSubset(id: string) {
    commit(rows.filter(r => r._id !== id));
  }

  function updateSubset(id: string, updated: Partial<SubsetRow>) {
    commit(rows.map(r => (r._id === id ? { ...r, ...updated } : r)));
  }

  function addAddress(subsetId: string) {
    const subset = rows.find(r => r._id === subsetId);
    if (!subset) return;
    updateSubset(subsetId, {
      addresses: [...subset.addresses, { _id: nextAddressId(), ip: '', hostname: '' }],
    });
  }

  function removeAddress(subsetId: string, addressId: string) {
    const subset = rows.find(r => r._id === subsetId);
    if (!subset) return;
    updateSubset(subsetId, {
      addresses: subset.addresses.filter(a => a._id !== addressId),
    });
  }

  function editAddress(
    subsetId: string,
    addressId: string,
    field: keyof KubeEndpointAddress,
    val: string
  ) {
    const subset = rows.find(r => r._id === subsetId);
    if (!subset) return;
    updateSubset(subsetId, {
      addresses: subset.addresses.map(a => (a._id === addressId ? { ...a, [field]: val } : a)),
    });
  }

  function addPort(subsetId: string) {
    const subset = rows.find(r => r._id === subsetId);
    if (!subset) return;
    updateSubset(subsetId, {
      ports: [
        ...subset.ports,
        { _id: nextPortId(), name: '', appProtocol: 'http', port: 80, protocol: 'TCP' },
      ],
    });
  }

  function removePort(subsetId: string, portId: string) {
    const subset = rows.find(r => r._id === subsetId);
    if (!subset) return;
    updateSubset(subsetId, {
      ports: subset.ports.filter(p => p._id !== portId),
    });
  }

  function editPort(subsetId: string, portId: string, field: keyof KubeEndpointPort, val: string) {
    const subset = rows.find(r => r._id === subsetId);
    if (!subset) return;
    updateSubset(subsetId, {
      ports: subset.ports.map(p => {
        if (p._id !== portId) return p;
        if (field === 'port') {
          const num = parseInt(val, 10);
          if (isNaN(num) || num < 1 || num > 65535) return p;
          return { ...p, port: num };
        }
        return { ...p, [field]: val };
      }),
    });
  }

  return (
    <Box>
      {rows.map((subset, subsetIdx) => (
        <Box
          key={subset._id}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}
        >
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {t('translation|Subset {{ index }}', { index: subsetIdx + 1 })}
            </Typography>
            <IconButton
              size="small"
              onClick={() => removeSubset(subset._id)}
              aria-label={t('translation|Remove subset {{ index }}', { index: subsetIdx + 1 })}
            >
              <Icon icon="mdi:close-circle" width={20} height={20} />
            </IconButton>
          </Box>

          {/* Addresses */}
          <FieldLabel
            label={t('translation|Addresses')}
            helperText={t('translation|IP addresses that are ready to receive traffic')}
          />
          {subset.addresses.map(addr => (
            <Box
              key={addr._id}
              sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1, mb: 1, pl: 1 }}
            >
              <FormTextField
                label={t('translation|IP')}
                value={addr.ip}
                onChange={e => editAddress(subset._id, addr._id, 'ip', e.target.value)}
                inputProps={{ 'aria-label': t('translation|IP address') }}
                required
              />
              <FormTextField
                label={t('translation|Hostname')}
                value={addr.hostname ?? ''}
                onChange={e => editAddress(subset._id, addr._id, 'hostname', e.target.value)}
                inputProps={{ 'aria-label': t('translation|Hostname') }}
              />
              <FormTextField
                label={t('translation|Node Name')}
                value={addr.nodeName ?? ''}
                onChange={e => editAddress(subset._id, addr._id, 'nodeName', e.target.value)}
                inputProps={{ 'aria-label': t('translation|Node name') }}
              />
              <IconButton
                size="small"
                onClick={() => removeAddress(subset._id, addr._id)}
                aria-label={t('translation|Remove address {{ ip }}', { ip: addr.ip || addr._id })}
              >
                <Icon icon="mdi:close-circle" width={18} height={18} />
              </IconButton>
            </Box>
          ))}
          <Button
            size="small"
            onClick={() => addAddress(subset._id)}
            aria-label={t('translation|Add address')}
            sx={{ ml: 1, mb: 1 }}
          >
            <Icon icon="mdi:plus-circle" width={18} height={18} />
            <Typography variant="body2" sx={{ ml: 0.5 }}>
              {t('translation|Add Address')}
            </Typography>
          </Button>

          {/* Ports */}
          <FieldLabel
            label={t('translation|Ports')}
            helperText={t('translation|Port numbers available on the related IP addresses')}
          />
          {subset.ports.map(port => (
            <Box
              key={port._id}
              sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1, mb: 1, pl: 1 }}
            >
              <FormTextField
                label={t('translation|Name')}
                value={port.name ?? ''}
                onChange={e => editPort(subset._id, port._id, 'name', e.target.value)}
                inputProps={{ 'aria-label': t('translation|Port name') }}
              />
              <FormTextField
                label={t('translation|Port')}
                type="number"
                value={String(port.port)}
                onChange={e => editPort(subset._id, port._id, 'port', e.target.value)}
                inputProps={{
                  'aria-label': t('translation|Port number'),
                  min: 1,
                  max: 65535,
                  step: 1,
                }}
                required
              />
              <FormTextField
                label={t('translation|Protocol')}
                value={port.protocol}
                onChange={e => editPort(subset._id, port._id, 'protocol', e.target.value)}
                inputProps={{ 'aria-label': t('translation|Protocol') }}
                select
              >
                {PROTOCOLS.map(p => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </FormTextField>
              <FormTextField
                label={t('translation|App Protocol')}
                value={port.appProtocol ?? ''}
                onChange={e => editPort(subset._id, port._id, 'appProtocol', e.target.value)}
                inputProps={{ 'aria-label': t('translation|App protocol') }}
              />
              <IconButton
                size="small"
                onClick={() => removePort(subset._id, port._id)}
                aria-label={t('translation|Remove port {{ port }}', { port: port.port })}
              >
                <Icon icon="mdi:close-circle" width={18} height={18} />
              </IconButton>
            </Box>
          ))}
          <Button
            size="small"
            onClick={() => addPort(subset._id)}
            aria-label={t('translation|Add port')}
            sx={{ ml: 1 }}
          >
            <Icon icon="mdi:plus-circle" width={18} height={18} />
            <Typography variant="body2" sx={{ ml: 0.5 }}>
              {t('translation|Add Port')}
            </Typography>
          </Button>
        </Box>
      ))}

      <Button
        size="small"
        onClick={addSubset}
        color="primary"
        aria-label={t('translation|Add subset')}
      >
        <Icon icon="mdi:plus-circle" width={24} height={24} />
        <Typography variant="body2" sx={{ ml: 0.5 }}>
          {t('translation|New Subset')}
        </Typography>
      </Button>
    </Box>
  );
}

/** Endpoints creation form built on {@link CreateResourceForm}. Defines
 *  sections for metadata (name, namespace, labels) and subsets (addresses + ports). */
export default function CreateEndpointForm(props: CreateEndpointFormProps) {
  const { resource, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource = resource ?? {};

  const sections: FormSection[] = [
    {
      title: t('translation|Metadata'),
      fields: [
        { key: 'name', path: 'metadata.name', label: t('translation|Name'), required: true },
        {
          key: 'namespace',
          path: 'metadata.namespace',
          label: t('glossary|Namespace'),
          type: 'namespace' as const,
        },
        {
          key: 'labels',
          path: 'metadata.labels',
          label: t('translation|Labels'),
          type: 'labels' as const,
        },
      ],
    },
    {
      title: t('translation|Subsets'),
      fields: [
        {
          key: 'subsets',
          path: 'subsets',
          label: t('translation|Subsets'),
          helperText: t('translation|Each subset groups addresses with matching port numbers'),
          render: ({ value, onChange: onSubsetsChange }) => (
            <SubsetsEditor
              value={(value as KubeEndpointSubset[]) ?? []}
              onChange={onSubsetsChange}
            />
          ),
        },
      ],
    },
  ];

  return (
    <CreateResourceForm sections={sections} resource={normalizedResource} onChange={onChange} />
  );
}

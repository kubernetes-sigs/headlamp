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
import type { KubeEndpointSlicePort } from '../../lib/k8s/endpointSlices';
import { FormTextField } from '../common/Resource/CreateResourceForm';
import type { EndpointSliceDraft } from './CreateEndpointSliceForm';

type EndpointSlicePortDraft = RecursivePartial<KubeEndpointSlicePort>;
type EndpointSlicePortsDraft = NonNullable<EndpointSliceDraft['ports']>;

export interface EndpointSlicePortsFieldProps {
  value: EndpointSliceDraft['ports'];
  onChange: (ports: EndpointSlicePortsDraft) => void;
}

/** Edits the ports shared by every endpoint in an EndpointSlice. */
export function EndpointSlicePortsField(props: EndpointSlicePortsFieldProps) {
  const { value, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const ports: EndpointSlicePortsDraft = Array.isArray(value) ? value : [];
  const portsTitle = t('glossary|Ports');

  function updatePort(index: number, field: keyof EndpointSlicePortDraft, rawValue: string) {
    const nextPorts = ports.map(port =>
      port && typeof port === 'object' && !Array.isArray(port) ? { ...port } : {}
    );
    const nextPort = nextPorts[index];
    if (rawValue === '') {
      delete nextPort[field];
    } else if (field === 'port') {
      const numberValue = Number(rawValue);
      if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 65535) return;
      nextPort.port = numberValue;
    } else {
      (nextPort as Record<string, string>)[field] = rawValue;
    }
    onChange(nextPorts);
  }

  function addPort() {
    onChange([...ports, { name: '', port: 80, protocol: 'TCP' }]);
  }

  function removePort(index: number) {
    onChange(ports.filter((_port, portIndex) => portIndex !== index));
  }

  return (
    <Box>
      {ports.map((port, index) => {
        const rowLabel = `${portsTitle} ${index + 1}`;
        return (
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
              inputProps={{ 'aria-label': `${rowLabel} ${t('translation|Name')}` }}
              value={port?.name ?? ''}
              onChange={event => updatePort(index, 'name', event.target.value)}
            />
            <FormTextField
              label={t('translation|App Protocol')}
              inputProps={{ 'aria-label': `${rowLabel} ${t('translation|App Protocol')}` }}
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
                'aria-label': `${rowLabel} ${t('translation|Port')}`,
              }}
            />
            <FormTextField
              label={t('translation|Protocol')}
              select
              inputProps={{ 'aria-label': `${rowLabel} ${t('translation|Protocol')}` }}
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
              aria-label={`${rowLabel} ${t('translation|Remove port')}`}
              onClick={() => removePort(index)}
            >
              <Icon icon="mdi:close-circle" width={24} height={24} />
            </IconButton>
          </Box>
        );
      })}
      <Button size="small" onClick={addPort} aria-label={t('translation|Add port')}>
        <Icon icon="mdi:plus-circle" width={24} height={24} />
        <Typography variant="body2" sx={{ ml: 0.5 }}>
          {t('translation|New Port')}
        </Typography>
      </Button>
    </Box>
  );
}

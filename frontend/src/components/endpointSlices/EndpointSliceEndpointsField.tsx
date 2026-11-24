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
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type {
  KubeEndpointSliceEndpoint,
  KubeEndpointSliceEndpointConditions,
} from '../../lib/k8s/endpointSlices';
import { useId } from '../../lib/util';
import { FormTextField } from '../common/Resource/CreateResourceForm';
import { getEndpointIPIssueText } from '../endpoints/EndpointSubsetsField';
import type { EndpointSliceDraft } from './CreateEndpointSliceForm';
import { getEndpointSliceAddressIssue, MAX_ENDPOINT_ADDRESSES } from './endpointSliceValidation';

type EndpointDraft = RecursivePartial<KubeEndpointSliceEndpoint>;
type EndpointsDraft = NonNullable<EndpointSliceDraft['endpoints']>;
type EndpointTextField = 'hostname' | 'nodeName' | 'zone';
type EndpointCondition = keyof KubeEndpointSliceEndpointConditions;

/** How the API interprets an omitted (nil) condition, per discovery/v1 EndpointConditions. */
const CONDITION_DEFAULTS: Record<EndpointCondition, boolean> = {
  ready: true,
  serving: true,
  terminating: false,
};

const ADDRESS_PLACEHOLDERS: Record<string, string> = {
  IPv4: '10.1.2.3',
  IPv6: '2001:db8::1',
  FQDN: 'backend.example.com',
};

export interface EndpointSliceEndpointsFieldProps {
  value: EndpointSliceDraft['endpoints'];
  /** The slice's `addressType`, which decides how each address is validated. */
  addressType: unknown;
  onChange: (endpoints: EndpointsDraft) => void;
}

function toEndpoint(endpoint: unknown): EndpointDraft {
  return endpoint && typeof endpoint === 'object' && !Array.isArray(endpoint)
    ? (endpoint as EndpointDraft)
    : {};
}

function isConditionChecked(endpoint: EndpointDraft, condition: EndpointCondition): boolean {
  const value = endpoint.conditions?.[condition];
  return typeof value === 'boolean' ? value : CONDITION_DEFAULTS[condition];
}

/** Edits the endpoints (addresses, topology and conditions) of an EndpointSlice. */
export function EndpointSliceEndpointsField(props: EndpointSliceEndpointsFieldProps) {
  const { value, addressType, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const endpoints: EndpointsDraft = Array.isArray(value) ? value : [];
  const baseId = useId('endpoint-slice-endpoints-');

  function updateEndpoint(index: number, next: EndpointDraft) {
    onChange(
      endpoints.map((endpoint, endpointIndex) => (endpointIndex === index ? next : endpoint))
    );
  }

  function updateText(index: number, field: EndpointTextField, rawValue: string) {
    const next = { ...toEndpoint(endpoints[index]) };
    // The API server rejects an empty hostname or nodeName, so clearing a field unsets it.
    if (rawValue === '') {
      delete next[field];
    } else {
      next[field] = rawValue;
    }
    updateEndpoint(index, next);
  }

  function updateCondition(index: number, condition: EndpointCondition, checked: boolean) {
    const endpoint = toEndpoint(endpoints[index]);
    const conditions =
      endpoint.conditions && typeof endpoint.conditions === 'object' ? endpoint.conditions : {};
    updateEndpoint(index, { ...endpoint, conditions: { ...conditions, [condition]: checked } });
  }

  function addEndpoint() {
    onChange([...endpoints, { addresses: [''], conditions: { ready: true } }]);
  }

  function removeEndpoint(index: number) {
    onChange(endpoints.filter((_endpoint, endpointIndex) => endpointIndex !== index));
  }

  /** Explains why a typed address is rejected; empty rows get no message so new rows aren't flagged. */
  function getAddressErrorText(address: unknown): string | undefined {
    if (typeof address !== 'string' || address === '') {
      return undefined;
    }
    const issue = getEndpointSliceAddressIssue(address, addressType);
    switch (issue) {
      case null:
        return undefined;
      case 'not-ipv4':
        return t('translation|Enter a valid IPv4 address.');
      case 'not-ipv6':
        return t('translation|Enter a valid IPv6 address.');
      case 'invalid-fqdn':
        return t(
          'translation|Enter a fully qualified domain name with at least two labels, such as backend.example.com.'
        );
      default:
        return getEndpointIPIssueText(issue, t);
    }
  }

  const conditionLabels: Record<EndpointCondition, string> = {
    ready: t('glossary|Ready'),
    serving: t('glossary|Serving'),
    terminating: t('glossary|Terminating'),
  };

  return (
    <Box>
      {endpoints.map((rawEndpoint, index) => {
        const endpoint = toEndpoint(rawEndpoint);
        const addresses = Array.isArray(endpoint.addresses) ? endpoint.addresses : [];
        const endpointLabelId = `${baseId}-endpoint-${index}`;
        const addressesLabelId = `${endpointLabelId}-addresses`;
        const conditionsLabelId = `${endpointLabelId}-conditions`;
        const endpointLabel = t('translation|Endpoint {{ number }}', { number: index + 1 });
        const addressesTitle = t('glossary|Addresses');
        const conditionsTitle = t('glossary|Conditions');

        function setAddresses(next: string[]) {
          updateEndpoint(index, { ...endpoint, addresses: next });
        }

        return (
          <Box
            key={index}
            role="group"
            aria-labelledby={endpointLabelId}
            sx={theme => ({
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              p: 2,
              mb: 2,
            })}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography id={endpointLabelId} variant="subtitle2">
                {endpointLabel}
              </Typography>
              <IconButton
                aria-label={`${t('translation|Remove endpoint')} ${index + 1}`}
                onClick={() => removeEndpoint(index)}
              >
                <Icon icon="mdi:close-circle" width={24} height={24} />
              </IconButton>
            </Box>

            <Box
              sx={{ mt: 2 }}
              role="group"
              aria-labelledby={`${endpointLabelId} ${addressesLabelId}`}
            >
              <Typography id={addressesLabelId} variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                {addressesTitle}
              </Typography>
              {addresses.map((address, addressIndex) => {
                const errorText = getAddressErrorText(address);
                const rowLabel = `${endpointLabel} ${addressesTitle} ${addressIndex + 1}`;
                return (
                  <Box
                    key={addressIndex}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 1,
                      // Top-align so an error message doesn't shift the remove button.
                      alignItems: 'start',
                      mb: 1,
                    }}
                  >
                    <FormTextField
                      label={t('translation|Address')}
                      placeholder={ADDRESS_PLACEHOLDERS[String(addressType)]}
                      inputProps={{ 'aria-label': `${rowLabel} ${t('translation|Address')}` }}
                      value={address ?? ''}
                      onChange={event =>
                        setAddresses(
                          addresses.map((current, i) =>
                            i === addressIndex ? event.target.value : current ?? ''
                          )
                        )
                      }
                      error={!!errorText}
                      helperText={errorText}
                    />
                    <IconButton
                      aria-label={`${rowLabel} ${t('translation|Remove address')}`}
                      onClick={() => setAddresses(addresses.filter((_a, i) => i !== addressIndex))}
                    >
                      <Icon icon="mdi:close-circle" width={24} height={24} />
                    </IconButton>
                  </Box>
                );
              })}
              <Button
                size="small"
                disabled={addresses.length >= MAX_ENDPOINT_ADDRESSES}
                onClick={() => setAddresses([...addresses.map(a => a ?? ''), ''])}
                aria-label={`${endpointLabel} ${t('translation|New Address')}`}
              >
                <Icon icon="mdi:plus-circle" width={24} height={24} />
                <Typography variant="body2" sx={{ ml: 0.5 }}>
                  {t('translation|New Address')}
                </Typography>
              </Button>
            </Box>

            <Box
              sx={{
                mt: 2,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                gap: 1,
              }}
            >
              {(
                [
                  ['hostname', t('glossary|Hostname')],
                  ['nodeName', t('translation|Node Name')],
                  ['zone', t('translation|Zone')],
                ] as const
              ).map(([field, label]) => (
                <FormTextField
                  key={field}
                  label={label}
                  inputProps={{ 'aria-label': `${endpointLabel} ${label}` }}
                  value={endpoint[field] ?? ''}
                  onChange={event => updateText(index, field, event.target.value)}
                />
              ))}
            </Box>

            <Box
              sx={{ mt: 2 }}
              role="group"
              aria-labelledby={`${endpointLabelId} ${conditionsLabelId}`}
            >
              <Typography id={conditionsLabelId} variant="body2" sx={{ fontWeight: 'bold' }}>
                {conditionsTitle}
              </Typography>
              {(Object.keys(conditionLabels) as EndpointCondition[]).map(condition => (
                <FormControlLabel
                  key={condition}
                  label={conditionLabels[condition]}
                  control={
                    <Checkbox
                      checked={isConditionChecked(endpoint, condition)}
                      onChange={event => updateCondition(index, condition, event.target.checked)}
                      inputProps={{
                        'aria-label': `${endpointLabel} ${conditionLabels[condition]}`,
                      }}
                    />
                  }
                />
              ))}
            </Box>
          </Box>
        );
      })}
      <Button size="small" onClick={addEndpoint} aria-label={t('translation|Add endpoint')}>
        <Icon icon="mdi:plus-circle" width={24} height={24} />
        <Typography variant="body2" sx={{ ml: 0.5 }}>
          {t('translation|New Endpoint')}
        </Typography>
      </Button>
    </Box>
  );
}

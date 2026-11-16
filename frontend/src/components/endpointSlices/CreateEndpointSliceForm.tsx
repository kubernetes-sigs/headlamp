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

import { useTranslation } from 'react-i18next';
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type { KubeEndpointSlice } from '../../lib/k8s/endpointSlices';
import CreateResourceForm, {
  FormSection,
  metadataSection,
} from '../common/Resource/CreateResourceForm';
import { EndpointSliceEndpointsField } from './EndpointSliceEndpointsField';
import { EndpointSlicePortsField } from './EndpointSlicePortsField';
import {
  areEndpointSliceEndpointsValid,
  areEndpointSlicePortsValid,
  ENDPOINT_SLICE_ADDRESS_TYPES,
  isValidAddressType,
  isValidLabelValue,
  SERVICE_NAME_LABEL,
} from './endpointSliceValidation';

/** An EndpointSlice can stay incomplete while the user fills out the form. */
export type EndpointSliceDraft = RecursivePartial<KubeEndpointSlice>;

export interface CreateEndpointSliceFormProps {
  resource?: EndpointSliceDraft;
  onChange: (resource: EndpointSliceDraft) => void;
  onValidChange?: (valid: boolean) => void;
}

const EMPTY_ENDPOINT_SLICE_DRAFT: EndpointSliceDraft = {};

export default function CreateEndpointSliceForm(props: CreateEndpointSliceFormProps) {
  const { resource = EMPTY_ENDPOINT_SLICE_DRAFT, onChange, onValidChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);
  const metadata = metadataSection(t);

  const sections: FormSection[] = [
    {
      ...metadata,
      fields: [
        ...metadata.fields,
        {
          key: 'serviceName',
          // Bracket notation keeps the dots and slash in the label key as one path segment.
          path: `metadata.labels["${SERVICE_NAME_LABEL}"]`,
          label: t('translation|Service'),
          helperText: t(
            'translation|Name of the Service this slice belongs to. Sets the kubernetes.io/service-name label.'
          ),
          validate: isValidLabelValue,
        },
      ],
    },
    {
      title: t('glossary|Endpoints'),
      fields: [
        {
          key: 'addressType',
          path: 'addressType',
          label: t('translation|Address Type'),
          type: 'select',
          required: true,
          validate: isValidAddressType,
          helperText: t('translation|The type of address used by every endpoint in this slice.'),
          options: ENDPOINT_SLICE_ADDRESS_TYPES.map(value => ({ value, label: value })),
        },
        {
          key: 'endpoints',
          path: 'endpoints',
          label: t('glossary|Endpoints'),
          helperText: t(
            'translation|Backends in this slice, each with its addresses, location and conditions.'
          ),
          required: true,
          validate: (value, current) => areEndpointSliceEndpointsValid(value, current?.addressType),
          render: ({ value, onChange: onEndpointsChange, resource: current }) => (
            <EndpointSliceEndpointsField
              value={value}
              addressType={current?.addressType}
              onChange={onEndpointsChange}
            />
          ),
        },
      ],
    },
    {
      title: t('glossary|Ports'),
      fields: [
        {
          key: 'ports',
          path: 'ports',
          label: t('glossary|Ports'),
          helperText: t(
            'translation|Ports exposed by every endpoint in this slice. Port names must be unique.'
          ),
          validate: areEndpointSlicePortsValid,
          render: ({ value, onChange: onPortsChange }) => (
            <EndpointSlicePortsField value={value} onChange={onPortsChange} />
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

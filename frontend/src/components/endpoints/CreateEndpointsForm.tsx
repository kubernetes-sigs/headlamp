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
import type { KubeEndpoint } from '../../lib/k8s/endpoints';
import CreateResourceForm, {
  FormSection,
  metadataSection,
} from '../common/Resource/CreateResourceForm';
import { EndpointSubsetsField } from './EndpointSubsetsField';
import { areSubsetsValid } from './endpointsValidation';

/** An Endpoints object can stay incomplete while the user fills out the form. */
export type EndpointsDraft = RecursivePartial<KubeEndpoint>;

export interface CreateEndpointsFormProps {
  resource?: EndpointsDraft;
  onChange: (resource: EndpointsDraft) => void;
  onValidChange?: (valid: boolean) => void;
}

const EMPTY_ENDPOINTS_DRAFT: EndpointsDraft = {};

export default function CreateEndpointsForm(props: CreateEndpointsFormProps) {
  const { resource = EMPTY_ENDPOINTS_DRAFT, onChange, onValidChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const sections: FormSection[] = [
    metadataSection(t),
    {
      title: t('glossary|Subsets'),
      fields: [
        {
          key: 'subsets',
          path: 'subsets',
          label: t('glossary|Subsets'),
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

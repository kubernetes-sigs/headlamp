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
import type { KubeService } from '../../lib/k8s/service';
import CreateResourceForm, {
  FormSection,
  FormTextField,
  metadataSection,
} from '../common/Resource/CreateResourceForm';

/** A service can stay incomplete while the user is filling out the form. */
export type ServiceDraft = RecursivePartial<KubeService>;

/** Props for the controlled service creation form. */
export interface CreateServiceFormProps {
  resource?: ServiceDraft;
  onChange: (resource: ServiceDraft) => void;
  onValidChange?: (valid: boolean) => void;
}

const EMPTY_SERVICE_DRAFT: ServiceDraft = {};

export default function CreateServiceForm(props: CreateServiceFormProps) {
  const { resource = EMPTY_SERVICE_DRAFT, onChange, onValidChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const sections: FormSection[] = [
    metadataSection(t),
    {
      title: t('translation|Spec'),
      fields: [
        {
          key: 'type',
          path: 'spec.type',
          label: t('translation|Type'),
          type: 'select',
          options: ['ClusterIP', 'NodePort', 'LoadBalancer', 'ExternalName'].map(value => ({
            value,
            label: value,
          })),
        },
        {
          key: 'clusterIP',
          path: 'spec.clusterIP',
          label: t('translation|Cluster IP'),
          helperText: t('translation|Leave empty to have Kubernetes assign an IP.'),
        },
        {
          key: 'ports',
          path: 'spec.ports',
          label: t('translation|Ports'),
          type: 'ports',
          required: true,
        },
        {
          key: 'externalIPs',
          path: 'spec.externalIPs',
          label: t('translation|External IPs'),
          render: ({ value, onChange: onExternalIPsChange }) => (
            <FormTextField
              value={Array.isArray(value) ? value.join(', ') : ''}
              placeholder="192.0.2.1, 192.0.2.2"
              onChange={event =>
                onExternalIPsChange(
                  event.target.value
                    .split(',')
                    .map(ip => ip.trim())
                    .filter(Boolean)
                )
              }
              inputProps={{ 'aria-label': t('translation|External IPs') }}
            />
          ),
        },
        {
          key: 'selector',
          path: 'spec.selector',
          label: t('translation|Selector'),
          type: 'labels',
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

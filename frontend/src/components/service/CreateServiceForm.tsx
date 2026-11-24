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

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type { KubeService } from '../../lib/k8s/service';
import CreateResourceForm, {
  FormSection,
  FormTextField,
  metadataSection,
  ServicePortsTextField,
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

function parseExternalIPs(raw: string): string[] {
  return raw
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);
}

interface ExternalIPsFieldProps {
  value: unknown;
  onChange: (ips: string[]) => void;
  label: string;
}

// Hold the raw text locally so the user can type commas/spaces without the
// join/split round-trip in the parent stripping the separator mid-edit.
function ExternalIPsField({ value, onChange, label }: ExternalIPsFieldProps) {
  const incoming = Array.isArray(value) ? (value as string[]) : [];
  const [raw, setRaw] = useState<string>(() => incoming.join(', '));

  // Adopt external updates (e.g. resource reset) only when the incoming array
  // isn't already what our buffer would produce.
  useEffect(() => {
    const parsed = parseExternalIPs(raw);
    const sameLength = parsed.length === incoming.length;
    const sameContents = sameLength && parsed.every((ip, i) => ip === incoming[i]);
    if (!sameContents) {
      setRaw(incoming.join(', '));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <FormTextField
      value={raw}
      placeholder="192.0.2.1, 192.0.2.2"
      onChange={event => {
        const next = event.target.value;
        setRaw(next);
        onChange(parseExternalIPs(next));
      }}
      inputProps={{ 'aria-label': label }}
    />
  );
}

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
          // ExternalName is intentionally omitted: it requires spec.externalName,
          // which this form does not model yet.
          options: ['ClusterIP', 'NodePort', 'LoadBalancer'].map(value => ({
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
          render: ({ value, onChange: onPortsChange, resource: current }) => {
            const type = current?.spec?.type;
            const showNodePort = type === 'NodePort' || type === 'LoadBalancer';
            return (
              <ServicePortsTextField
                value={value}
                onChange={onPortsChange}
                showNodePort={showNodePort}
              />
            );
          },
        },
        {
          key: 'externalIPs',
          path: 'spec.externalIPs',
          label: t('translation|External IPs'),
          render: ({ value, onChange: onExternalIPsChange }) => (
            <ExternalIPsField
              value={value}
              onChange={onExternalIPsChange}
              label={t('translation|External IPs')}
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

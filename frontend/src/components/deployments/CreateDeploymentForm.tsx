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
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type { KubeDeployment } from '../../lib/k8s/deployment';
import CreateResourceForm, {
  FormSection,
  FormTextField,
} from '../common/Resource/CreateResourceForm';

/**
 * Draft (in-progress) Deployment edited by the form. Every nested field is
 * optional, but the shape stays aligned with {@link KubeDeployment} so typos
 * are caught at compile time.
 *
 * Convention for new create forms:
 *   `export type XxxDraft = RecursivePartial<KubeXxx>;`
 */
export type DeploymentDraft = RecursivePartial<KubeDeployment>;

/** Props for {@link CreateDeploymentForm}. Shared `{ resource, onChange }`
 *  contract used by all create-resource forms. */
export interface CreateDeploymentFormProps {
  resource?: DeploymentDraft;
  onChange: (resource: DeploymentDraft) => void;
}

let podLabelRowIdCounter = 0;
const nextPodLabelRowId = () => `pod-label-${++podLabelRowIdCounter}`;

interface ValidatedPodLabelsEditorProps {
  /** Current pod template labels map. */
  value: Record<string, string>;
  /** Called with the updated map. */
  onChange: (labels: Record<string, string>) => void;
  /** The current selector matchLabels map (for validation). */
  matchLabels: Record<string, string>;
}

/** Pod template labels editor specific to Deployments. Validates each
 *  row against `spec.selector.matchLabels`:
 *   - 'covered'  – key is in the selector and the values agree (green check)
 *   - 'conflict' – key is in the selector but with a different value; the
 *                  Deployment would be rejected by the API server (red)
 *   - 'extra'    – key is not in the selector; legal and common, shown as a
 *                  neutral info hint ("not used by selector")
 *   - 'empty'    – key or value blank; no indicator
 *  Selector entries missing from the template are surfaced once at the top
 *  of the editor, since there is no template row to attach an icon to. */
function ValidatedPodLabelsEditor(props: ValidatedPodLabelsEditorProps) {
  const { value, onChange, matchLabels } = props;
  const { t } = useTranslation(['translation']);
  const entries = Object.entries(value);
  const [rowIds, setRowIds] = React.useState<string[]>(() =>
    entries.map(() => nextPodLabelRowId())
  );

  React.useEffect(() => {
    setRowIds(prev => {
      if (prev.length === entries.length) return prev;
      if (prev.length < entries.length) {
        const next = [...prev];
        while (next.length < entries.length) {
          next.push(nextPodLabelRowId());
        }
        return next;
      }
      return prev.slice(0, entries.length);
    });
  }, [entries.length]);

  function addLabel() {
    const baseKey = 'new-label';
    let nextKey = baseKey;
    let idx = 1;
    while (Object.prototype.hasOwnProperty.call(value, nextKey)) {
      idx += 1;
      nextKey = `${baseKey}-${idx}`;
    }
    onChange({ ...value, [nextKey]: '' });
  }

  function handleDelete(labelKey: string) {
    const next = { ...value };
    delete next[labelKey];
    onChange(next);
  }

  function handleKeyEdit(oldKey: string, newKeyVal: string) {
    if (newKeyVal === oldKey) return;
    if (newKeyVal && Object.prototype.hasOwnProperty.call(value, newKeyVal)) {
      return;
    }
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k === oldKey ? newKeyVal : k] = v;
    }
    onChange(result);
  }

  function handleValueEdit(labelKey: string, newValue: string) {
    onChange({ ...value, [labelKey]: newValue });
  }

  function getRowStatus(k: string, v: string): 'empty' | 'covered' | 'conflict' | 'extra' {
    if (!k.trim() || !v.trim()) return 'empty';
    if (!matchLabels || !Object.prototype.hasOwnProperty.call(matchLabels, k)) {
      // Extra template labels are valid; the selector is allowed to be a
      // proper subset of the template labels.
      return 'extra';
    }
    return matchLabels[k] === v ? 'covered' : 'conflict';
  }

  // Selector entries that are not satisfied by the template. Kubernetes
  // requires `selector.matchLabels` to be a subset of
  // `template.metadata.labels`; any miss here will be rejected by the API.
  const missingFromTemplate = Object.entries(matchLabels ?? {}).filter(
    ([k, v]) => !Object.prototype.hasOwnProperty.call(value, k) || value[k] !== v
  );

  return (
    <Box>
      {missingFromTemplate.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }} role="alert">
          {t('translation|Add these selector labels to the template: {{ pairs }}', {
            pairs: missingFromTemplate.map(([k, v]) => `${k}=${v}`).join(', '),
          })}
        </Alert>
      )}
      {entries.map(([k, v], index) => {
        const status = getRowStatus(k, v);
        return (
          <Box
            key={rowIds[index] ?? `pod-label-${index}`}
            sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}
          >
            {status === 'covered' && (
              <Tooltip title={t('translation|This label is required by the selector')} arrow>
                <Box
                  component="span"
                  role="img"
                  tabIndex={0}
                  aria-label={t('translation|Required by selector')}
                  sx={{
                    display: 'inline-flex',
                    color: 'success.main',
                    lineHeight: 0,
                    cursor: 'help',
                    borderRadius: '50%',
                    '&:focus-visible': {
                      outline: theme => `2px solid ${theme.palette.primary.main}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Icon
                    icon="mdi:check-circle"
                    width={20}
                    height={20}
                    style={{ display: 'block' }}
                  />
                </Box>
              </Tooltip>
            )}
            {status === 'conflict' && (
              <Tooltip
                title={t(
                  'translation|The selector requires this key with a different value ({{ expected }}); the Deployment will be rejected by the API server',
                  { expected: matchLabels[k] }
                )}
                arrow
              >
                <Box
                  component="span"
                  role="img"
                  tabIndex={0}
                  aria-label={t('translation|Conflicts with selector')}
                  sx={{
                    display: 'inline-flex',
                    color: 'error.main',
                    lineHeight: 0,
                    cursor: 'help',
                    borderRadius: '50%',
                    '&:focus-visible': {
                      outline: theme => `2px solid ${theme.palette.primary.main}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Icon
                    icon="mdi:alert-circle"
                    width={20}
                    height={20}
                    style={{ display: 'block' }}
                  />
                </Box>
              </Tooltip>
            )}
            {status === 'extra' && (
              <Tooltip
                title={t(
                  'translation|This label is not used by the selector (extra labels are allowed)'
                )}
                arrow
              >
                <Box
                  component="span"
                  role="img"
                  tabIndex={0}
                  aria-label={t('translation|Not used by selector')}
                  sx={{
                    display: 'inline-flex',
                    color: 'text.secondary',
                    lineHeight: 0,
                    cursor: 'help',
                    borderRadius: '50%',
                    '&:focus-visible': {
                      outline: theme => `2px solid ${theme.palette.primary.main}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Icon
                    icon="mdi:information-outline"
                    width={20}
                    height={20}
                    style={{ display: 'block' }}
                  />
                </Box>
              </Tooltip>
            )}
            {status === 'empty' && <Box sx={{ width: 20 }} />}
            <FormTextField
              label={t('translation|Key')}
              value={k}
              onChange={e => handleKeyEdit(k, e.target.value)}
              inputProps={{ 'aria-label': t('translation|Label key') }}
            />
            <FormTextField
              label={t('translation|Value')}
              value={v}
              onChange={e => handleValueEdit(k, e.target.value)}
              inputProps={{ 'aria-label': t('translation|Label value') }}
            />
            <IconButton
              onClick={() => handleDelete(k)}
              color="default"
              size="small"
              aria-label={t('translation|Remove label {{ label }}', {
                label: `${k}=${v}`,
              })}
            >
              <Icon icon="mdi:close-circle" width={24} height={24} />
            </IconButton>
          </Box>
        );
      })}
      <Box sx={{ mt: 2 }}>
        <Button
          onClick={addLabel}
          color="primary"
          size="small"
          aria-label={t('translation|Add label')}
        >
          <Icon icon="mdi:plus-circle" width={24} height={24} />
          <Typography variant="body2" sx={{ ml: 0.5 }}>
            {t('translation|New Label')}
          </Typography>
        </Button>
      </Box>
    </Box>
  );
}

/** Deployment-specific creation form built on {@link CreateResourceForm}.
 *  Defines sections for metadata (name, namespace, labels), the selector,
 *  replica count, and the pod template (labels + containers). The pod
 *  template labels editor validates each row against the selector matchLabels
 *  and surfaces a per-row status icon. */
export default function CreateDeploymentForm(props: CreateDeploymentFormProps) {
  const { resource, onChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource: DeploymentDraft = resource ?? {};

  // Seed default pod template labels ({ app: 'headlamp' }) once, mirroring
  // the defaults the base YAML provides for `metadata.labels` and
  // `spec.selector.matchLabels`. Done as an effect so the change is
  // reflected in the underlying resource (and the YAML editor), not just
  // visually in the form.
  const didSeedPodLabelsRef = React.useRef(false);
  React.useEffect(() => {
    if (didSeedPodLabelsRef.current) return;
    const existing = normalizedResource.spec?.template?.metadata?.labels;
    if (existing && Object.keys(existing).length > 0) {
      didSeedPodLabelsRef.current = true;
      return;
    }
    didSeedPodLabelsRef.current = true;
    const next: DeploymentDraft = {
      ...normalizedResource,
      spec: {
        ...(normalizedResource.spec ?? {}),
        template: {
          ...(normalizedResource.spec?.template ?? {}),
          metadata: {
            ...(normalizedResource.spec?.template?.metadata ?? {}),
            labels: { app: 'headlamp' },
          },
        },
      },
    };
    onChange(next);
    // Intentionally only run once on mount to avoid clobbering user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      title: t('translation|Spec'),
      fields: [
        {
          key: 'replicas',
          path: 'spec.replicas',
          label: t('translation|Replicas'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t(
            'translation|Desired number of pod replicas (leave empty to use the default of 1)'
          ),
        },
        {
          key: 'matchLabels',
          path: 'spec.selector.matchLabels',
          label: t('translation|matchLabels'),
          type: 'labels' as const,
          helperText: t(
            'translation|Selects which pods belong to this Deployment; must match the pod template labels'
          ),
        },
      ],
    },
    {
      title: t('translation|Template'),
      fields: [
        {
          key: 'podLabels',
          path: 'spec.template.metadata.labels',
          label: t('translation|Pod template labels'),
          type: 'labels' as const,
          helperText: t(
            'translation|Applied to pods created by this Deployment; must match the selector matchLabels'
          ),
          render: ({ value, onChange: onLabelsChange, resource: r }) => {
            const typedResource = r as DeploymentDraft;
            return (
              <ValidatedPodLabelsEditor
                value={(value as Record<string, string>) ?? {}}
                onChange={onLabelsChange}
                matchLabels={
                  (typedResource.spec?.selector?.matchLabels as
                    | Record<string, string>
                    | undefined) ?? {}
                }
              />
            );
          },
        },
        {
          key: 'containers',
          path: 'spec.template.spec.containers',
          label: t('translation|Containers'),
          type: 'containers' as const,
        },
      ],
    },
  ];

  return (
    <CreateResourceForm
      sections={sections}
      resource={normalizedResource as Record<string, any>}
      onChange={onChange as (resource: Record<string, any>) => void}
    />
  );
}

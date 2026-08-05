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
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type { KubeJobSet } from '../../lib/k8s/jobSet';
import CreateResourceForm, {
  FieldLabel,
  FormSection,
  FormTextField,
  metadataSection,
} from '../common/Resource/CreateResourceForm';
import { ContainerTextField } from '../common/Resource/CreateResourceForm/workloadFields';

/** Draft JobSet being edited. */
export type JobSetDraft = RecursivePartial<KubeJobSet>;

/** A single replicated job entry. */
interface ReplicatedJob {
  name?: string;
  replicas?: number;
  template?: {
    spec?: {
      parallelism?: number;
      completions?: number;
      template?: {
        spec?: {
          containers?: Record<string, any>[];
          restartPolicy?: string;
        };
      };
    };
  };
}

/** Props for {@link CreateJobSetForm}. */
export interface CreateJobSetFormProps {
  resource?: JobSetDraft;
  onChange: (resource: JobSetDraft) => void;
  /** Called when required-field validity changes. */
  onValidChange?: (valid: boolean) => void;
}

const RESTART_POLICIES = [
  { value: 'Never', label: 'Never' },
  { value: 'OnFailure', label: 'OnFailure' },
];

let replicatedJobIdCounter = 0;
const nextReplicatedJobId = () => `rj-${++replicatedJobIdCounter}`;

/** Editor for the `spec.replicatedJobs` array. Each entry renders its own
 *  name, replicas, parallelism, completions, containers, and restart policy. */
function ReplicatedJobsEditor(props: {
  value: ReplicatedJob[];
  onChange: (jobs: ReplicatedJob[]) => void;
}) {
  const { value, onChange } = props;
  const { t } = useTranslation(['translation']);
  const safeValue = Array.isArray(value) ? value : [];

  const [rowIds, setRowIds] = React.useState<string[]>(() =>
    safeValue.map(() => nextReplicatedJobId())
  );

  React.useEffect(() => {
    setRowIds(prev => {
      if (prev.length === safeValue.length) return prev;
      if (prev.length < safeValue.length) {
        const next = [...prev];
        while (next.length < safeValue.length) {
          next.push(nextReplicatedJobId());
        }
        return next;
      }
      return prev.slice(0, safeValue.length);
    });
  }, [safeValue.length]);

  function handleAdd() {
    setRowIds(prev => [...prev, nextReplicatedJobId()]);
    onChange([
      ...safeValue,
      {
        name: '',
        replicas: 1,
        template: {
          spec: {
            parallelism: 1,
            completions: 1,
            template: {
              spec: {
                containers: [{ name: '', image: '', command: [], imagePullPolicy: 'Always' }],
                restartPolicy: 'Never',
              },
            },
          },
        },
      },
    ]);
  }

  function handleRemove(index: number) {
    setRowIds(prev => prev.filter((_, i) => i !== index));
    onChange(safeValue.filter((_, i) => i !== index));
  }

  function updateJob(index: number, updater: (job: ReplicatedJob) => ReplicatedJob) {
    onChange(safeValue.map((j, i) => (i !== index ? j : updater({ ...j }))));
  }

  function handleNumberField(
    index: number,
    path: 'replicas' | 'parallelism' | 'completions',
    raw: string
  ) {
    if (raw === '') {
      updateJob(index, job => {
        if (path === 'replicas') {
          const rest = { ...job };
          delete rest.replicas;
          return rest;
        }
        const spec = { ...job.template?.spec };
        delete (spec as any)[path];
        return { ...job, template: { ...job.template, spec } };
      });
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return;

    updateJob(index, job => {
      if (path === 'replicas') {
        return { ...job, replicas: parsed };
      }
      return {
        ...job,
        template: {
          ...job.template,
          spec: { ...job.template?.spec, [path]: parsed },
        },
      };
    });
  }

  return (
    <Box>
      {safeValue.map((job, index) => (
        <Box
          key={rowIds[index] ?? `rj-fallback-${index}`}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            mb: 3,
            ...(index > 0 && { pt: 2, borderTop: 1, borderColor: 'divider' }),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {t('translation|Replicated Job {{ index }}', { index: index + 1 })}
            </Typography>
            {safeValue.length > 1 && (
              <IconButton
                onClick={() => handleRemove(index)}
                color="default"
                size="small"
                aria-label={t('translation|Remove replicated job {{ name }}', {
                  name: job.name || index + 1,
                })}
              >
                <Icon icon="mdi:close-circle" width={24} height={24} />
              </IconButton>
            )}
          </Box>

          <Box>
            <FieldLabel label={t('translation|Name')} required />
            <FormTextField
              value={job.name ?? ''}
              onChange={e => updateJob(index, j => ({ ...j, name: e.target.value }))}
              inputProps={{ 'aria-label': t('translation|Replicated job name') }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FieldLabel label={t('translation|Replicas')} sx={{ minWidth: 80, mb: 0 }} />
              <Box sx={{ width: 100 }}>
                <FormTextField
                  value={job.replicas ?? ''}
                  onChange={e => handleNumberField(index, 'replicas', e.target.value)}
                  type="number"
                  inputProps={{
                    'aria-label': t('translation|Replicas'),
                    step: 1,
                    min: 0,
                  }}
                />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FieldLabel label={t('translation|Parallelism')} sx={{ minWidth: 80, mb: 0 }} />
              <Box sx={{ width: 100 }}>
                <FormTextField
                  value={job.template?.spec?.parallelism ?? ''}
                  onChange={e => handleNumberField(index, 'parallelism', e.target.value)}
                  type="number"
                  inputProps={{
                    'aria-label': t('translation|Parallelism'),
                    step: 1,
                    min: 0,
                  }}
                />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FieldLabel label={t('translation|Completions')} sx={{ minWidth: 80, mb: 0 }} />
              <Box sx={{ width: 100 }}>
                <FormTextField
                  value={job.template?.spec?.completions ?? ''}
                  onChange={e => handleNumberField(index, 'completions', e.target.value)}
                  type="number"
                  inputProps={{
                    'aria-label': t('translation|Completions'),
                    step: 1,
                    min: 0,
                  }}
                />
              </Box>
            </Box>
          </Box>

          <Box>
            <FieldLabel label={t('translation|Containers')} required />
            <ContainerTextField
              value={job.template?.spec?.template?.spec?.containers ?? []}
              onChange={containers =>
                updateJob(index, j => ({
                  ...j,
                  template: {
                    ...j.template,
                    spec: {
                      ...j.template?.spec,
                      template: {
                        ...j.template?.spec?.template,
                        spec: {
                          ...j.template?.spec?.template?.spec,
                          containers,
                        },
                      },
                    },
                  },
                }))
              }
              showCommand
            />
          </Box>

          <Box sx={{ width: 220 }}>
            <FieldLabel
              label={t('translation|Restart Policy')}
              required
              helperText={t(
                'translation|Job pods must use Never or OnFailure; Always is not allowed.'
              )}
            />
            <FormTextField
              value={job.template?.spec?.template?.spec?.restartPolicy ?? ''}
              onChange={e =>
                updateJob(index, j => ({
                  ...j,
                  template: {
                    ...j.template,
                    spec: {
                      ...j.template?.spec,
                      template: {
                        ...j.template?.spec?.template,
                        spec: {
                          ...j.template?.spec?.template?.spec,
                          restartPolicy: e.target.value,
                        },
                      },
                    },
                  },
                }))
              }
              select
              inputProps={{ 'aria-label': t('translation|Restart policy') }}
            >
              {RESTART_POLICIES.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </FormTextField>
          </Box>
        </Box>
      ))}
      <Box sx={{ mt: 1 }}>
        <Button
          onClick={handleAdd}
          color="primary"
          size="small"
          aria-label={t('translation|Add replicated job')}
        >
          <Icon icon="mdi:plus-circle" width={24} height={24} />
          <Typography variant="body2" sx={{ ml: 0.5 }}>
            {t('translation|New Replicated Job')}
          </Typography>
        </Button>
      </Box>
    </Box>
  );
}

/** Check that every replicated job has valid containers and a restart policy. */
function isReplicatedJobsValid(jobs: ReplicatedJob[]): boolean {
  if (!Array.isArray(jobs) || jobs.length === 0) return false;
  return jobs.every(job => {
    if (!job.name || typeof job.name !== 'string' || job.name.trim().length === 0) return false;
    const containers = job.template?.spec?.template?.spec?.containers;
    if (
      !Array.isArray(containers) ||
      containers.length === 0 ||
      !containers.every(c => c?.image && typeof c.image === 'string' && c.image.trim().length > 0)
    ) {
      return false;
    }
    const rp = job.template?.spec?.template?.spec?.restartPolicy;
    if (!rp || typeof rp !== 'string' || rp.trim().length === 0) return false;
    return true;
  });
}

/** JobSet create form built on {@link CreateResourceForm}. Sections:
 *  metadata and replicated jobs. Each replicated job entry contains its
 *  own name, replicas, parallelism, completions, containers, and restart
 *  policy fields. */
export default function CreateJobSetForm(props: CreateJobSetFormProps) {
  const { resource, onChange, onValidChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const sections: FormSection[] = [
    metadataSection(t),
    {
      title: t('translation|Replicated Jobs'),
      fields: [
        {
          key: 'replicatedJobs',
          path: 'spec.replicatedJobs',
          label: '',
          required: true,
          validate: isReplicatedJobsValid,
          render: ({ value, onChange: onFieldChange }) => (
            <ReplicatedJobsEditor value={value ?? []} onChange={onFieldChange} />
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

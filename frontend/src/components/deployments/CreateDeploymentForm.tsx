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
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type { KubeDeployment } from '../../lib/k8s/deployment';
import CreateResourceForm, {
  buildLabelRows,
  FormSection,
  FormTextField,
  labelMapsEqual,
  LabelRow,
  labelRowsToMap,
} from '../common/Resource/CreateResourceForm';

let matchLabelRowIdCounter = 0;
const nextMatchLabelRowId = () => `match-label-${++matchLabelRowIdCounter}`;

let podLabelRowIdCounter = 0;
const nextPodLabelRowId = () => `pod-label-${++podLabelRowIdCounter}`;

/** Draft Deployment being edited. All fields optional but typed against
 *  {@link KubeDeployment} to catch typos.
 *
 *  Convention: `export type XxxDraft = RecursivePartial<KubeXxx>;` */
export type DeploymentDraft = RecursivePartial<KubeDeployment>;

/** Props for {@link CreateDeploymentForm}. Standard `{ resource, onChange }`
 *  used by all create-resource forms. */
export interface CreateDeploymentFormProps {
  resource?: DeploymentDraft;
  onChange: (resource: DeploymentDraft) => void;
}

interface MatchLabelsEditorProps {
  /** Current selector matchLabels map. */
  value: Record<string, string>;
  /** Called with the updated selector matchLabels map. */
  onChange: (labels: Record<string, string>) => void;
}

/** Editor for `spec.selector.matchLabels`. The parent mirrors these into
 *  the pod template labels, which render read-only below. */
function MatchLabelsEditor(props: MatchLabelsEditorProps) {
  const { value, onChange } = props;
  const { t } = useTranslation(['translation']);

  const [rows, setRows] = React.useState<LabelRow[]>(() =>
    buildLabelRows(value).map(r => ({ ...r, id: nextMatchLabelRowId() }))
  );
  const lastEmittedRef = React.useRef<Record<string, string>>(labelRowsToMap(rows));

  React.useEffect(() => {
    const incoming = value ?? {};
    if (!labelMapsEqual(incoming, lastEmittedRef.current)) {
      setRows(
        Object.entries(incoming).map(([k, v]) => ({
          id: nextMatchLabelRowId(),
          key: k,
          value: v,
        }))
      );
      lastEmittedRef.current = incoming;
    }
  }, [value]);

  function commit(next: LabelRow[]) {
    setRows(next);
    const map = labelRowsToMap(next);
    lastEmittedRef.current = map;
    onChange(map);
  }

  function addRow() {
    const used = new Set(rows.map(r => r.key));
    let nextKey = 'new-label';
    let idx = 1;
    while (used.has(nextKey)) {
      idx += 1;
      nextKey = `new-label-${idx}`;
    }
    commit([...rows, { id: nextMatchLabelRowId(), key: nextKey, value: '' }]);
  }

  function handleDelete(id: string) {
    commit(rows.filter(r => r.id !== id));
  }

  function handleKeyEdit(id: string, newKeyVal: string) {
    // Let keys collide briefly while typing; otherwise you couldn't edit a
    // key down to one that already exists. The serialized map keeps the
    // first row, so it stays valid.
    commit(rows.map(r => (r.id === id ? { ...r, key: newKeyVal } : r)));
  }

  function handleValueEdit(id: string, newValue: string) {
    commit(rows.map(r => (r.id === id ? { ...r, value: newValue } : r)));
  }

  return (
    <Box>
      {rows.map(r => {
        const k = r.key;
        const v = r.value;
        return (
          <Box key={r.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}>
            <FormTextField
              label={t('translation|Key')}
              value={k}
              onChange={e => handleKeyEdit(r.id, e.target.value)}
              inputProps={{ 'aria-label': t('translation|Label key') }}
            />
            <FormTextField
              label={t('translation|Value')}
              value={v}
              onChange={e => handleValueEdit(r.id, e.target.value)}
              inputProps={{ 'aria-label': t('translation|Label value') }}
            />
            <IconButton
              onClick={() => handleDelete(r.id)}
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
          onClick={addRow}
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

/** Pod template labels editor. Rows whose key is in `lockedLabels` (mirrored
 *  from the selector) render disabled with no delete. Other rows are fully
 *  editable; both end up in `spec.template.metadata.labels`. */
function PodLabelsEditor(props: {
  value: Record<string, string>;
  lockedLabels: Record<string, string>;
  onChange: (labels: Record<string, string>) => void;
}) {
  const { value, lockedLabels, onChange } = props;
  const { t } = useTranslation(['translation']);

  /** Editable rows = full value minus locked keys. */
  function extrasFromValue(full: Record<string, string>): Record<string, string> {
    const extras: Record<string, string> = {};
    for (const [k, v] of Object.entries(full ?? {})) {
      if (!(k in lockedLabels)) extras[k] = v;
    }
    return extras;
  }

  const [extraRows, setExtraRows] = React.useState<LabelRow[]>(() =>
    buildLabelRows(extrasFromValue(value)).map(r => ({ ...r, id: nextPodLabelRowId() }))
  );
  /** Last full map we emitted. Lets us tell our own echo apart from an
   *  outside change (e.g. YAML editor) and re-seed rows only when needed. */
  const lastEmittedRef = React.useRef<Record<string, string>>({
    ...lockedLabels,
    ...labelRowsToMap(extraRows),
  });

  React.useEffect(() => {
    const merged = { ...lockedLabels, ...value };
    if (!labelMapsEqual(merged, lastEmittedRef.current)) {
      const incomingExtras = extrasFromValue(value ?? {});
      setExtraRows(
        Object.entries(incomingExtras).map(([k, v]) => ({
          id: nextPodLabelRowId(),
          key: k,
          value: v,
        }))
      );
      lastEmittedRef.current = merged;
    }
    // extrasFromValue closes over lockedLabels; both are in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lockedLabels]);

  function commit(nextExtras: LabelRow[]) {
    setExtraRows(nextExtras);
    const extrasMap = labelRowsToMap(nextExtras);
    // Locked entries win on key collision so selector edits aren't
    // shadowed by a same-key extra.
    const full = { ...extrasMap, ...lockedLabels };
    lastEmittedRef.current = full;
    onChange(full);
  }

  function addRow() {
    const used = new Set([...extraRows.map(r => r.key), ...Object.keys(lockedLabels)]);
    let nextKey = 'new-label';
    let idx = 1;
    while (used.has(nextKey)) {
      idx += 1;
      nextKey = `new-label-${idx}`;
    }
    commit([...extraRows, { id: nextPodLabelRowId(), key: nextKey, value: '' }]);
  }

  function handleDelete(id: string) {
    commit(extraRows.filter(r => r.id !== id));
  }

  function handleKeyEdit(id: string, newKeyVal: string) {
    // Same as MatchLabelsEditor: allow keys to collide briefly mid-edit.
    commit(extraRows.map(r => (r.id === id ? { ...r, key: newKeyVal } : r)));
  }

  function handleValueEdit(id: string, newValue: string) {
    commit(extraRows.map(r => (r.id === id ? { ...r, value: newValue } : r)));
  }

  const lockedEntries = Object.entries(lockedLabels ?? {});

  return (
    <Box>
      {lockedEntries.map(([k, v]) => (
        <Box
          key={`locked-${k}`}
          sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}
        >
          <FormTextField
            label={t('translation|Key')}
            value={k}
            disabled
            inputProps={{ 'aria-label': t('translation|Label key'), readOnly: true }}
          />
          <FormTextField
            label={t('translation|Value')}
            value={v}
            disabled
            inputProps={{ 'aria-label': t('translation|Label value'), readOnly: true }}
          />
        </Box>
      ))}
      {extraRows.map(r => (
        <Box key={r.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}>
          <FormTextField
            label={t('translation|Key')}
            value={r.key}
            onChange={e => handleKeyEdit(r.id, e.target.value)}
            inputProps={{ 'aria-label': t('translation|Label key') }}
          />
          <FormTextField
            label={t('translation|Value')}
            value={r.value}
            onChange={e => handleValueEdit(r.id, e.target.value)}
            inputProps={{ 'aria-label': t('translation|Label value') }}
          />
          <IconButton
            onClick={() => handleDelete(r.id)}
            color="default"
            size="small"
            aria-label={t('translation|Remove label {{ label }}', {
              label: `${r.key}=${r.value}`,
            })}
          >
            <Icon icon="mdi:close-circle" width={24} height={24} />
          </IconButton>
        </Box>
      ))}
      <Box sx={{ mt: 2 }}>
        <Button
          onClick={addRow}
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

/** Deployment create form built on {@link CreateResourceForm}. Sections:
 *  metadata, spec (selector + replicas), pod template. Selector entries
 *  show up read-only in the pod template labels; users can add extra
 *  editable labels next to them. */
export default function CreateDeploymentForm(props: CreateDeploymentFormProps) {
  const { resource, onChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource: DeploymentDraft = resource ?? {};

  const matchLabels = React.useMemo(
    () =>
      (normalizedResource.spec?.selector?.matchLabels as Record<string, string> | undefined) ?? {},
    [normalizedResource.spec?.selector?.matchLabels]
  );
  const podLabels =
    (normalizedResource.spec?.template?.metadata?.labels as Record<string, string> | undefined) ??
    {};

  // Seed defaults once: selector (and mirrored pod labels) and replicas.
  // Run as an effect so the seed reaches the underlying resource / YAML,
  // not just the form UI.
  const didSeedDefaultsRef = React.useRef(false);
  React.useEffect(() => {
    if (didSeedDefaultsRef.current) return;
    didSeedDefaultsRef.current = true;
    const next = _.cloneDeep(normalizedResource) as DeploymentDraft;
    let changed = false;
    if (Object.keys(matchLabels).length === 0) {
      _.set(next, 'spec.selector.matchLabels', { app: 'headlamp' });
      _.set(next, 'spec.template.metadata.labels', {
        ...((next.spec?.template?.metadata?.labels as Record<string, string> | undefined) ?? {}),
        app: 'headlamp',
      });
      changed = true;
    } else {
      // Mirror every selector entry into pod labels, keeping existing
      // extras.
      const mergedPodLabels = { ...podLabels, ...matchLabels };
      if (!labelMapsEqual(mergedPodLabels, podLabels)) {
        _.set(next, 'spec.template.metadata.labels', mergedPodLabels);
        changed = true;
      }
    }
    if (next.spec?.replicas === undefined) {
      _.set(next, 'spec.replicas', 1);
      changed = true;
    }
    if (changed) {
      onChange(next);
    }
    // Only run once: re-running would clobber user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Apply a new selector map. Old selector entries are replaced with
   *  `nextMatch`; any pod-template-only extras are preserved. Selector wins
   *  on key collision, matching {@link PodLabelsEditor}. */
  function handleMatchLabelsChange(nextMatch: Record<string, string>) {
    const extras: Record<string, string> = {};
    for (const [k, v] of Object.entries(podLabels)) {
      if (!(k in matchLabels)) extras[k] = v;
    }
    const nextPodLabels = { ...extras, ...nextMatch };

    const nextResource = _.cloneDeep(normalizedResource) as DeploymentDraft;
    _.set(nextResource, 'spec.selector.matchLabels', nextMatch);
    if (!labelMapsEqual(nextPodLabels, podLabels)) {
      _.set(nextResource, 'spec.template.metadata.labels', nextPodLabels);
    }
    onChange(nextResource);
  }

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
          helperText: t('translation|Desired number of pod replicas'),
        },
        {
          key: 'matchLabels',
          path: 'spec.selector.matchLabels',
          label: t('translation|Selector'),
          type: 'labels' as const,
          helperText: t(
            'translation|Selects which pods belong to this Deployment. Entries are mirrored read-only into the pod template labels below; extra pod-template-only labels can be added there.'
          ),
          render: ({ value }) => (
            <MatchLabelsEditor
              value={(value as Record<string, string>) ?? {}}
              onChange={handleMatchLabelsChange}
            />
          ),
        },
      ],
    },
    {
      title: t('translation|Pod Template'),
      fields: [
        {
          key: 'podLabels',
          path: 'spec.template.metadata.labels',
          label: t('translation|Labels'),
          type: 'labels' as const,
          helperText: t(
            'translation|Selector entries appear here read-only. Use New Label to add extra pod-template-only labels.'
          ),
          render: ({ value, onChange: onPodLabelsChange }) => (
            <PodLabelsEditor
              value={(value as Record<string, string>) ?? {}}
              lockedLabels={matchLabels}
              onChange={onPodLabelsChange}
            />
          ),
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

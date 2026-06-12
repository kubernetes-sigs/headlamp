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

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import Pod from '../../../lib/k8s/pod';
import { timeAgo } from '../../../lib/util';
import { makePodStatusLabel } from '../../pod/List';
import EmptyContent from '../EmptyContent';
import Link from '../Link';
import { SectionBox } from '../SectionBox';
import SimpleTable from '../SimpleTable';
import { findPodReferences, PodReference, PodUsage, TargetKind } from './podReferences';

const KNOWN_WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'ReplicaSet',
  'Job',
  'CronJob',
  'Pod',
]);

export interface UsedBySectionProps {
  /** The ConfigMap or Secret whose consumers should be listed. */
  resource: KubeObject;
  /** Which kind of resource `resource` is. */
  resourceKind: TargetKind;
}

interface UsageChipsProps {
  usages: PodUsage[];
}

function usageLabel(usage: PodUsage, t: (key: string) => string): string {
  switch (usage.kind) {
    case 'env':
      return `${t('translation|env')} (${usage.container})`;
    case 'envFrom':
      return `${t('translation|envFrom')} (${usage.container})`;
    case 'volume':
      return `${t('translation|volume')} (${usage.volume})`;
    case 'projected':
      return `${t('translation|projected')} (${usage.volume})`;
    case 'imagePullSecret':
      return t('translation|imagePullSecret');
    default:
      return usage.kind;
  }
}

function UsageChips({ usages }: UsageChipsProps) {
  const { t } = useTranslation(['translation']);

  return (
    <Stack direction="row" flexWrap="wrap" gap={0.5}>
      {usages.map((usage, index) => (
        <Chip
          key={index}
          label={usageLabel(usage, t)}
          size="small"
          variant="outlined"
          color={usage.initContainer ? 'default' : 'primary'}
        />
      ))}
    </Stack>
  );
}

interface OwnerCellProps {
  pod: Pod;
}

function OwnerCell({ pod }: OwnerCellProps) {
  const owner =
    pod.metadata.ownerReferences?.find(ref => ref.controller) ?? pod.metadata.ownerReferences?.[0];
  if (!owner) {
    return <Typography variant="body2">-</Typography>;
  }

  const display = `${owner.kind}/${owner.name}`;
  if (!KNOWN_WORKLOAD_KINDS.has(owner.kind)) {
    return <Typography variant="body2">{display}</Typography>;
  }

  return (
    <Link
      routeName={owner.kind}
      params={{ name: owner.name, namespace: pod.metadata.namespace! }}
      activeCluster={pod.cluster}
    >
      {display}
    </Link>
  );
}

interface UsedByTableProps {
  references: PodReference[];
  reflectInURL: string;
}

// Treat missing creationTimestamp as epoch so the comparator stays total and deterministic.
function ageMs(ref: PodReference): number {
  const ts = ref.pod.metadata.creationTimestamp;
  return ts ? new Date(ts).getTime() : 0;
}

function UsedByTable({ references, reflectInURL }: UsedByTableProps) {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SimpleTable
      data={references}
      columns={[
        {
          label: t('glossary|Pod'),
          getter: (row: PodReference) => (
            <Link
              routeName="Pod"
              params={{ name: row.pod.metadata.name!, namespace: row.pod.metadata.namespace! }}
              activeCluster={row.pod.cluster}
            >
              {row.pod.metadata.name}
            </Link>
          ),
          sort: (a: PodReference, b: PodReference) =>
            a.pod.metadata.name!.localeCompare(b.pod.metadata.name!),
        },
        {
          label: t('translation|Status'),
          getter: (row: PodReference) => makePodStatusLabel(row.pod, false),
        },
        {
          label: t('translation|Owner'),
          getter: (row: PodReference) => <OwnerCell pod={row.pod} />,
        },
        {
          label: t('translation|How Used'),
          getter: (row: PodReference) => <UsageChips usages={row.usages} />,
        },
        {
          label: t('translation|Age'),
          getter: (row: PodReference) =>
            row.pod.metadata.creationTimestamp ? timeAgo(row.pod.metadata.creationTimestamp) : '',
          sort: (a: PodReference, b: PodReference) => ageMs(a) - ageMs(b),
        },
      ]}
      reflectInURL={reflectInURL}
    />
  );
}

function formatErrors(errors: Array<Error | ApiError> | null | undefined): string | null {
  if (!errors || errors.length === 0) {
    return null;
  }
  return errors.map(err => err.message).join('; ');
}

export default function UsedBySection({ resource, resourceKind }: UsedBySectionProps) {
  const { t } = useTranslation(['translation']);

  const {
    items: pods,
    errors,
    isLoading,
  } = Pod.useList({
    namespace: resource.metadata.namespace,
    cluster: resource.cluster,
  });

  const references = React.useMemo(
    () => findPodReferences(pods ?? [], resourceKind, resource.metadata.name),
    [pods, resourceKind, resource.metadata.name]
  );

  const errorMessage = formatErrors(errors);

  return (
    <SectionBox title={t('translation|Used By')}>
      {errorMessage && (
        <Box mb={1}>
          <EmptyContent color="error">{errorMessage}</EmptyContent>
        </Box>
      )}
      {!errorMessage && isLoading && <EmptyContent>{t('translation|Loading…')}</EmptyContent>}
      {!errorMessage && !isLoading && references.length === 0 && (
        <EmptyContent>
          {resourceKind === 'ConfigMap'
            ? t('translation|No Pods in this namespace reference this ConfigMap.')
            : t('translation|No Pods in this namespace reference this Secret.')}
        </EmptyContent>
      )}
      {!errorMessage && references.length > 0 && (
        <UsedByTable
          references={references}
          reflectInURL={`usedBy-${resourceKind.toLowerCase()}`}
        />
      )}
    </SectionBox>
  );
}

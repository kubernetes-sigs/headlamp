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

import Chip from '@mui/material/Chip';
import { styled } from '@mui/system';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import HPA from '../../lib/k8s/hpa';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';

const RootDiv = styled('div')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'left',
  flexWrap: 'wrap',
  '& > *': {
    margin: theme.spacing(0.5),
  },
}));

const PaddedChip = styled(Chip)({
  paddingTop: '2px',
  paddingBottom: '2px',
});

export default function HpaList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|Horizontal Pod Autoscalers')}
      resourceClass={HPA}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'reference',
          label: t('translation|Reference'),
          getValue: item => item.referenceObject?.metadata.name,
          render: item => (
            <Link kubeObject={item.referenceObject}>
              {item.referenceObject?.kind}/{item.referenceObject?.metadata.name}
            </Link>
          ),
        },
        {
          id: 'targets',
          label: t('translation|Targets'),
          getValue: item =>
            item
              .metrics(t)
              .map(it => it.shortValue)
              .join(', '),
          render: (hpa: HPA) => {
            const value: ReactNode[] = [];
            const metrics = hpa.metrics(t);
            if (metrics.length) {
              value.push(
                <PaddedChip label={metrics[0].shortValue} variant="outlined" size="small" key="1" />
              );
              if (metrics.length > 1) {
                value.push(
                  <PaddedChip
                    label={metrics.length - 1 + t('translation|more…')}
                    variant="outlined"
                    size="small"
                    key="2"
                  />
                );
              }
            }
            return <RootDiv>{value}</RootDiv>;
          },
        },
        {
          id: 'minReplicas',
          label: t('translation|MinReplicas'),
          gridTemplate: 'min-content',
          getValue: item => item.spec.minReplicas,
        },
        {
          id: 'maxReplicas',
          label: t('translation|MaxReplicas'),
          gridTemplate: 'min-content',
          getValue: item => item.spec.maxReplicas,
        },
        {
          id: 'currentReplicas',
          label: t('glossary|Replicas'),
          gridTemplate: 'min-content',
          getValue: item => item.status.currentReplicas,
        },
        'age',
      ]}
    />
  );
}

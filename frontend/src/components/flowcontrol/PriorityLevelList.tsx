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
import PriorityLevelConfiguration from '../../lib/k8s/priorityLevelConfiguration';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import Loader from '../common/Loader';
import ResourceListView from '../common/Resource/ResourceListView';
import SectionBox from '../common/SectionBox';

export default function PriorityLevelList() {
  const { t } = useTranslation(['glossary', 'translation']);

  const clusters = useClustersServing(PriorityLevelConfiguration);
  const title = t('glossary|Priority Levels');

  if (!clusters) {
    return (
      <SectionBox title={title}>
        <Loader title={t('translation|Loading...')} />
      </SectionBox>
    );
  }

  return (
    <ResourceListView
      title={title}
      resourceClass={PriorityLevelConfiguration}
      clusters={clusters}
      columns={[
        'name',
        'cluster',
        {
          id: 'type',
          label: t('translation|Type'),
          gridTemplate: 'min-content',
          getValue: item => item.type,
        },
        {
          id: 'nominalConcurrencyShares',
          label: t('translation|Nominal Concurrency Shares'),
          gridTemplate: 'min-content',
          getValue: item => item.nominalConcurrencyShares,
        },
        {
          id: 'limitResponse',
          label: t('translation|Limit Response'),
          getValue: item => item.limitResponseType ?? '-',
        },
        'age',
      ]}
    />
  );
}

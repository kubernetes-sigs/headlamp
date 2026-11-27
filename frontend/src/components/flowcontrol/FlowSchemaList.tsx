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
import FlowSchema from '../../lib/k8s/flowSchema';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import { StatusLabel } from '../common/Label';
import Loader from '../common/Loader';
import ResourceListView from '../common/Resource/ResourceListView';
import SectionBox from '../common/SectionBox';
import PriorityLevelReference from './PriorityLevelReference';

export default function FlowSchemaList() {
  const { t } = useTranslation(['glossary', 'translation']);

  const clusters = useClustersServing(FlowSchema);
  const title = t('glossary|Flow Schemas');

  if (!clusters) {
    return (
      <SectionBox title={title}>
        <Loader title={t('translation|Loading...')} />
      </SectionBox>
    );
  }

  function missingPriorityLevel(item: FlowSchema) {
    switch (item.danglingCondition?.status) {
      case 'True':
        return t('translation|Yes');
      case 'False':
        return t('translation|No');
      default:
        return t('translation|Unknown');
    }
  }

  return (
    <ResourceListView
      title={title}
      resourceClass={FlowSchema}
      clusters={clusters}
      defaultSortingColumn={{ id: 'matchingPrecedence', desc: false }}
      columns={[
        'name',
        'cluster',
        {
          id: 'priorityLevel',
          label: t('glossary|Priority Level'),
          getValue: item => item.priorityLevelName,
          render: item => <PriorityLevelReference schema={item} />,
        },
        {
          id: 'matchingPrecedence',
          label: t('translation|Matching Precedence'),
          gridTemplate: 'min-content',
          getValue: item => item.matchingPrecedence,
        },
        {
          id: 'distinguisherMethod',
          label: t('translation|Distinguisher Method'),
          getValue: item => item.distinguisherMethod ?? '',
          render: item => item.distinguisherMethod ?? t('translation|None'),
        },
        {
          id: 'missingPriorityLevel',
          label: t('translation|Missing Priority Level'),
          getValue: missingPriorityLevel,
          render: item =>
            item.isDangling ? (
              <StatusLabel status="error" title={item.danglingCondition?.message}>
                {missingPriorityLevel(item)}
              </StatusLabel>
            ) : (
              missingPriorityLevel(item)
            ),
          filterVariant: 'multi-select',
        },
        'age',
      ]}
    />
  );
}

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
import { useParams } from 'react-router-dom';
import FlowSchema from '../../lib/k8s/flowSchema';
import PriorityLevelConfiguration from '../../lib/k8s/priorityLevelConfiguration';
import Link from '../common/Link';
import { ConditionsTable, DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

const percent = (value?: number) => (value === undefined ? undefined : `${value}%`);

function ReferencingFlowSchemas({ level }: { level: PriorityLevelConfiguration }) {
  const { t } = useTranslation(['glossary', 'translation']);
  const { items, error } = FlowSchema.useList({ cluster: level.cluster });
  const matchingSchemas = items?.filter(schema => schema.priorityLevelName === level.getName());
  // SimpleTable only shows its loader or error for null data, so a pending or failed
  // list must not arrive as undefined or an empty array: that reads as a cluster with
  // no Flow Schemas pointing here, which is not what we know.
  const data = error ? null : matchingSchemas ?? null;

  return (
    <SectionBox title={t('glossary|Flow Schemas')}>
      <SimpleTable
        columns={[
          {
            label: t('glossary|Flow Schema'),
            getter: (schema: FlowSchema) => (
              <Link
                routeName={FlowSchema.detailsRoute}
                activeCluster={schema.cluster}
                params={{ name: schema.getName() }}
              >
                {schema.getName()}
              </Link>
            ),
          },
        ]}
        data={data}
        emptyMessage={t('translation|No Flow Schemas reference this priority level.')}
        errorMessage={error?.message}
        reflectInURL="flowschemas"
      />
    </SectionBox>
  );
}

export default function PriorityLevelDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={PriorityLevelConfiguration}
      name={name}
      cluster={cluster}
      extraInfo={item =>
        item && [
          {
            name: t('translation|Type'),
            value: item.type,
          },
          {
            name: t('translation|Nominal Concurrency Shares'),
            value: item.nominalConcurrencyShares?.toString(),
            hide: item.nominalConcurrencyShares === undefined,
          },
          {
            name: t('translation|Lendable'),
            value: percent(item.lendablePercent),
            hide: item.lendablePercent === undefined,
          },
          {
            name: t('translation|Borrowing Limit'),
            value: percent(item.borrowingLimitPercent),
            hide: item.borrowingLimitPercent === undefined,
          },
          {
            name: t('translation|Limit Response'),
            value: item.limitResponseType ?? '-',
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.prioritylevel-queuing',
            section: item.queuing ? (
              <SectionBox title={t('translation|Queuing')}>
                <SimpleTable
                  columns={[
                    { label: t('translation|Queues'), datum: 'queues' },
                    { label: t('translation|Hand Size'), datum: 'handSize' },
                    { label: t('translation|Queue Length Limit'), datum: 'queueLengthLimit' },
                  ]}
                  data={[item.queuing]}
                  reflectInURL="queuing"
                />
              </SectionBox>
            ) : null,
          },
          {
            id: 'headlamp.prioritylevel-conditions',
            section:
              item.conditions.length > 0 ? (
                <SectionBox title={t('translation|Conditions')}>
                  <ConditionsTable resource={item.jsonData} showLastUpdate={false} />
                </SectionBox>
              ) : null,
          },
          {
            id: 'headlamp.prioritylevel-flowschemas',
            section: <ReferencingFlowSchemas level={item} />,
          },
        ]
      }
    />
  );
}

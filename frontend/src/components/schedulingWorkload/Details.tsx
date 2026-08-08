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
import { getSchedulingPolicyKind } from '../../lib/k8s/podGroup';
import type { CompositePodGroupTemplate, PodGroupTemplate } from '../../lib/k8s/schedulingWorkload';
import Workload from '../../lib/k8s/schedulingWorkload';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

/** The pod group templates a Workload is made of. */
function PodGroupTemplatesSection({ templates }: { templates: PodGroupTemplate[] }) {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SectionBox title={t('translation|Pod Group Templates')}>
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            getter: (template: PodGroupTemplate) => template.name,
          },
          {
            label: t('translation|Policy'),
            getter: (template: PodGroupTemplate) =>
              getSchedulingPolicyKind(template.schedulingPolicy) ?? '',
          },
          {
            label: t('translation|Min Count'),
            getter: (template: PodGroupTemplate) => template.schedulingPolicy?.gang?.minCount ?? '',
          },
          {
            label: t('translation|Topology Keys'),
            getter: (template: PodGroupTemplate) =>
              template.schedulingConstraints?.topology?.map(item => item.key).join(', ') ?? '',
          },
        ]}
        data={templates}
        emptyMessage={t('translation|No pod group templates in this workload.')}
        reflectInURL="podGroupTemplates"
      />
    </SectionBox>
  );
}

/** The composite pod group templates a Workload is made of, when it has any. */
function CompositePodGroupTemplatesSection({
  templates,
}: {
  templates: CompositePodGroupTemplate[];
}) {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SectionBox title={t('translation|Composite Pod Group Templates')}>
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            getter: (template: CompositePodGroupTemplate) => template.name,
          },
          {
            label: t('glossary|Priority Class'),
            getter: (template: CompositePodGroupTemplate) => template.priorityClassName ?? '',
          },
          {
            label: t('glossary|Priority'),
            getter: (template: CompositePodGroupTemplate) => template.priority ?? '',
          },
          {
            label: t('translation|Preemption Policy'),
            getter: (template: CompositePodGroupTemplate) => template.preemptionPolicy ?? '',
          },
          {
            label: t('translation|Pod Group Templates'),
            getter: (template: CompositePodGroupTemplate) =>
              template.podGroupTemplates?.length ?? 0,
          },
        ]}
        data={templates}
        reflectInURL="compositePodGroupTemplates"
      />
    </SectionBox>
  );
}

export default function SchedulingWorkloadDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={Workload}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Pod Group Templates'),
            value: item.podGroupTemplates.length,
          },
          {
            name: t('translation|Composite Pod Group Templates'),
            value: item.compositePodGroupTemplates.length,
            hide: item.compositePodGroupTemplates.length === 0,
          },
          {
            name: t('glossary|Controller'),
            value:
              item.spec?.controllerRef &&
              `${item.spec.controllerRef.kind}/${item.spec.controllerRef.name}`,
            hide: !item.spec?.controllerRef,
          },
        ]
      }
      extraSections={item =>
        item && [
          <PodGroupTemplatesSection templates={item.podGroupTemplates} />,
          ...(item.compositePodGroupTemplates.length > 0
            ? [<CompositePodGroupTemplatesSection templates={item.compositePodGroupTemplates} />]
            : []),
        ]
      }
    />
  );
}

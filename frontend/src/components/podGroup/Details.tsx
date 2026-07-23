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
import PodGroup from '../../lib/k8s/podGroup';
import Link from '../common/Link';
import { ConditionsSection, DetailsGrid } from '../common/Resource';

export default function PodGroupDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={PodGroup}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Policy'),
            value: item.policyKind,
            hide: !item.policyKind,
          },
          {
            name: t('translation|Min Count'),
            value: item.minCount,
            hide: item.minCount === undefined,
          },
          {
            name: t('glossary|Workload'),
            value: item.workloadName && (
              <Link
                routeName="Workload"
                params={{ namespace: item.metadata.namespace, name: item.workloadName }}
                activeCluster={item.cluster}
              >
                {item.workloadName}
              </Link>
            ),
            hide: !item.workloadName,
          },
          {
            name: t('translation|Pod Group Template Name'),
            value: item.spec?.podGroupTemplateRef?.workload?.podGroupTemplateName,
            hide: !item.spec?.podGroupTemplateRef?.workload?.podGroupTemplateName,
          },
          {
            name: t('translation|Disruption Mode'),
            value: item.spec?.disruptionMode,
            hide: !item.spec?.disruptionMode,
          },
          {
            name: t('glossary|Priority Class'),
            value: item.spec?.priorityClassName && (
              <Link
                routeName="priorityClass"
                params={{ name: item.spec.priorityClassName }}
                activeCluster={item.cluster}
              >
                {item.spec.priorityClassName}
              </Link>
            ),
            hide: !item.spec?.priorityClassName,
          },
          {
            name: t('glossary|Priority'),
            value: item.spec?.priority,
            hide: item.spec?.priority === undefined,
          },
          {
            name: t('translation|Topology Keys'),
            value: item.spec?.schedulingConstraints?.topology
              ?.map(constraint => constraint.key)
              .join(', '),
            hide: !item.spec?.schedulingConstraints?.topology?.length,
          },
        ]
      }
      extraSections={item => item && [<ConditionsSection resource={item?.jsonData} />]}
    />
  );
}

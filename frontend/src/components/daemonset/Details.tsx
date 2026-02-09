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
import DaemonSet from '../../lib/k8s/daemonSet';
import {
  ContainersSection,
  DetailsGrid,
  MetadataDictGrid,
  OwnedPodsSection,
  RollbackButton,
} from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

interface TolerationsSection {
  resource: DaemonSet;
  t?: (...args: any[]) => string;
}

function TolerationsSection(props: TolerationsSection) {
  const { resource } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  if (!resource) {
    return null;
  }

  const tolerations = resource.spec.template.spec?.tolerations || [];

  function getEffectString(effect: string, seconds?: number) {
    if (effect === 'NoExecute' && seconds === undefined) {
      const secondsLabel = seconds === undefined ? 'forever' : `${seconds}s`;
      return `${effect} (${secondsLabel})`;
    }

    return effect;
  }

  return (
    <SectionBox title={t('Tolerations')}>
      <SimpleTable
        data={tolerations}
        columns={[
          {
            label: t('translation|Key'),
            getter: toleration => toleration.key,
            sort: true,
          },
          {
            label: t('translation|Operator'),
            getter: toleration => toleration.operator,
            sort: true,
          },
          {
            label: t('translation|Value'),
            getter: toleration => toleration.value,
            sort: true,
          },
          {
            label: t('translation|Effect'),
            getter: toleration => getEffectString(toleration.effect, toleration.tolerationSeconds),
            sort: true,
          },
        ]}
        reflectInURL="tolerations"
      />
    </SectionBox>
  );
}

export default function DaemonSetDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={DaemonSet}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      actions={item => {
        if (!item) return [];
        return [
          {
            id: 'headlamp.daemonset-rollback',
            action: <RollbackButton key="rollback" item={item} />,
          },
        ];
      }}
      extraInfo={item =>
        item && [
          {
            name: t('Update Strategy'),
            value: item?.spec.updateStrategy.type,
          },
          {
            name: t('Selector'),
            value: <MetadataDictGrid dict={item.spec.selector.matchLabels || {}} />,
          },
          {
            name: t('Node Selector'),
            value: <MetadataDictGrid dict={item.spec.template.spec.nodeSelector || {}} />,
          },
        ]
      }
      extraSections={item => [
        {
          id: 'headlamp.daemonset-owned-pods',
          section: <OwnedPodsSection resource={item} />,
        },
        {
          id: 'headlamp.daemonset-tolerations',
          section: <TolerationsSection resource={item} />,
        },
        {
          id: 'headlamp.daemonset-containers',
          section: <ContainersSection resource={item} />,
        },
      ]}
    />
  );
}

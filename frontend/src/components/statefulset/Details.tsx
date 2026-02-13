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
import { StringDict } from '../../lib/k8s/cluster';
import StatefulSet from '../../lib/k8s/statefulSet';
import {
  ContainersSection,
  DetailsGrid,
  MetadataDictGrid,
  OwnedPodsSection,
  RevisionHistorySection,
  RollbackButton,
} from '../common/Resource';

export default function StatefulSetDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={StatefulSet}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      actions={item => {
        if (!item) return [];
        return [
          {
            id: 'headlamp.statefulset-rollback',
            action: <RollbackButton key="rollback" item={item} />,
          },
        ];
      }}
      extraInfo={item =>
        item && [
          {
            name: t('Update Strategy'),
            value: item.spec.updateStrategy.type,
          },
          {
            name: t('Selector'),
            value: <MetadataDictGrid dict={item.spec.selector.matchLabels as StringDict} />,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.statefulset-owned-pods',
            section: <OwnedPodsSection resource={item} />,
          },
          {
            id: 'headlamp.statefulset-containers',
            section: <ContainersSection resource={item} />,
          },
          {
            id: 'headlamp.statefulset-revision-history',
            section: <RevisionHistorySection resource={item} />,
          },
        ]
      }
    />
  );
}

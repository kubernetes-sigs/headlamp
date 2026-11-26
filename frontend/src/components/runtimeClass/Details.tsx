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

import _ from 'lodash';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { RuntimeClass } from '../../lib/k8s/runtime';
import { DetailsGrid, MetadataDictGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

interface Toleration {
  key?: string;
  operator?: string;
  value?: string;
  effect?: string;
  tolerationSeconds?: number;
}

/** The tolerations added to pods that use the RuntimeClass. */
export function RuntimeClassTolerations(props: { tolerations: Toleration[] }) {
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <SectionBox title={t('glossary|Tolerations')}>
      <SimpleTable
        data={props.tolerations}
        columns={[
          { label: t('translation|Key'), getter: toleration => toleration.key ?? '-' },
          { label: t('translation|Operator'), getter: toleration => toleration.operator ?? '-' },
          { label: t('translation|Value'), getter: toleration => toleration.value ?? '-' },
          { label: t('translation|Effect'), getter: toleration => toleration.effect ?? '-' },
          {
            label: t('translation|Toleration Seconds'),
            getter: toleration => toleration.tolerationSeconds ?? '-',
          },
        ]}
      />
    </SectionBox>
  );
}

export function RuntimeClassDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['translation']);

  return (
    <DetailsGrid
      resourceType={RuntimeClass}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Handler'),
            value: item?.jsonData?.handler,
          },
          {
            name: t('translation|Pod Overhead'),
            value: <MetadataDictGrid dict={item.jsonData?.overhead?.podFixed ?? {}} />,
            hide: _.isEmpty(item.jsonData?.overhead?.podFixed),
          },
          {
            name: t('glossary|Node Selector'),
            value: <MetadataDictGrid dict={item.jsonData?.scheduling?.nodeSelector ?? {}} />,
            hide: _.isEmpty(item.jsonData?.scheduling?.nodeSelector),
          },
        ]
      }
      extraSections={item =>
        item &&
        !_.isEmpty(item.jsonData?.scheduling?.tolerations) && [
          {
            id: 'headlamp.runtimeclass-tolerations',
            section: <RuntimeClassTolerations tolerations={item.jsonData.scheduling.tolerations} />,
          },
        ]
      }
    />
  );
}

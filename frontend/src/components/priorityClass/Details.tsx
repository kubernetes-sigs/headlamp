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
import PriorityClass from '../../lib/k8s/priorityClass';
import { DetailsGrid } from '../common';

export default function PriorityClassDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['translation']);

  return (
    <DetailsGrid
      resourceType={PriorityClass}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Value'),
            value: item.value,
          },
          {
            name: t('translation|Global Default'),
            value: item.globalDefault || 'False',
          },
          {
            name: t('translation|Preemption Policy'),
            value: item.preemptionPolicy,
          },
          {
            name: t('translation|Description'),
            value: item.description,
          },
        ]
      }
    />
  );
}

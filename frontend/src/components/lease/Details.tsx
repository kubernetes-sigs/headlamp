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
import { useParams } from 'react-router';
import { Lease } from '../../lib/k8s/lease';
import { DateLabel } from '../common/Label';
import { DetailsGrid } from '../common/Resource';

export function LeaseDetails(props: { name?: string; namespace?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation();

  return (
    <DetailsGrid
      resourceType={Lease}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Holder Identity'),
            value: item.spec.holderIdentity,
          },
          {
            name: t('Lease Duration Seconds'),
            value: item.spec.leaseDurationSeconds,
          },
          {
            name: t('Renew Time'),
            value: <DateLabel date={item.spec.renewTime} />,
          },
        ]
      }
    />
  );
}

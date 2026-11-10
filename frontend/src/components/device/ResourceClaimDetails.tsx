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
import ResourceClaim from '../../lib/k8s/resourceClaim';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import ResourceClaimStatus from './ResourceClaimStatus';

export default function ResourceClaimDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ResourceClaim}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: <ResourceClaimStatus claim={item} />,
          },
          {
            name: t('glossary|Node'),
            value: item.allocatedNodeName && (
              <Link
                routeName="node"
                params={{ name: item.allocatedNodeName }}
                activeCluster={item.cluster}
              >
                {item.allocatedNodeName}
              </Link>
            ),
            hide: !item.allocatedNodeName,
          },
        ]
      }
    />
  );
}

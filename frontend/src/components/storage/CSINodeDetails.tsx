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
import type { CSINodeDriver } from '../../lib/k8s/csiNode';
import CSINode from '../../lib/k8s/csiNode';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function CSINodeDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={CSINode}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('glossary|Node'),
            value: (
              <Link
                routeName="node"
                params={{ name: item.metadata.name }}
                activeCluster={item.cluster}
              >
                {item.metadata.name}
              </Link>
            ),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.csinode-drivers',
            section: (
              <SectionBox title={t('Drivers')}>
                <SimpleTable
                  columns={[
                    {
                      label: t('translation|Name'),
                      getter: (driver: CSINodeDriver) => driver.name,
                    },
                    {
                      label: t('Node ID'),
                      getter: (driver: CSINodeDriver) => driver.nodeID,
                    },
                    {
                      label: t('Topology Keys'),
                      getter: (driver: CSINodeDriver) => (driver.topologyKeys ?? []).join(', '),
                    },
                    {
                      label: t('Allocatable Count'),
                      getter: (driver: CSINodeDriver) => driver.allocatable?.count ?? '-',
                    },
                  ]}
                  data={item.drivers}
                  emptyMessage={t('No drivers registered on this node.')}
                  reflectInURL="drivers"
                />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}

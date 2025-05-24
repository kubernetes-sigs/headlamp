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
import { useClustersConf } from '../../../lib/k8s';
import Link from '../../common/Link';
import SectionBox from '../../common/SectionBox';
import SimpleTable from '../../common/SimpleTable';

export default function SettingsClusters() {
  const clusterConf = useClustersConf();
  const { t } = useTranslation(['translation']);

  return (
    <SectionBox title="Cluster Settings">
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            getter: cluster => (
              <Link routeName="settingsCluster" params={{ cluster: cluster.name }}>
                {cluster.name}
              </Link>
            ),
          },
          {
            label: t('translation|Server'),
            datum: 'server',
          },
        ]}
        data={Object.values(clusterConf || {})}
      />
    </SectionBox>
  );
}

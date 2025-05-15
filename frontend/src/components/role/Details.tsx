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
import ClusterRole from '../../lib/k8s/clusterRole';
import Role from '../../lib/k8s/role';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function RoleDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace?: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={!namespace ? ClusterRole : Role}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraSections={item =>
        item && [
          {
            id: 'headlamp.role-rules',
            section: (
              <SectionBox title={t('Rules')}>
                <SimpleTable
                  columns={[
                    {
                      label: t('API Groups'),
                      getter: ({ apiGroups = [] }) => apiGroups.join(', '),
                    },
                    {
                      label: t('Resources'),
                      getter: ({ resources = [] }) => resources.join(', '),
                    },
                    {
                      label: t('Non Resources'),
                      getter: ({ nonResources = [] }) => nonResources.join(', '),
                    },
                    {
                      label: t('Verbs'),
                      getter: ({ verbs = [] }) => verbs.join(', '),
                    },
                  ]}
                  data={item.rules || []}
                  reflectInURL="rules"
                />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}

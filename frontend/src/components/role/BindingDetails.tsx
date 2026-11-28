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
import ClusterRoleBinding from '../../lib/k8s/clusterRoleBinding';
import RoleBinding from '../../lib/k8s/roleBinding';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function RoleBindingDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={!!namespace ? RoleBinding : ClusterRoleBinding}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Reference Kind'),
            value: item.roleRef?.kind,
          },
          {
            name: t('Reference Name'),
            value: item.roleRef?.name,
          },
          {
            name: t('Ref. API Group'),
            value: item.roleRef?.apiGroup,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.role-binding-info',
            section: (
              <SectionBox title={t('Binding Info')}>
                <SimpleTable
                  data={item.subjects ?? []}
                  columns={[
                    {
                      label: t('Kind'),
                      getter: subject => subject.kind,
                    },
                    {
                      label: t('translation|Name'),
                      getter: subject =>
                        // subject can hold a reference to non kube Objects
                        // such as user and group names, in that case
                        // dont create a link.
                        !subject?.apiGroup ? (
                          <Link
                            routeName={subject.kind}
                            params={{
                              namespace: subject.namespace || namespace,
                              name: subject.name,
                            }}
                            activeCluster={item.cluster || cluster}
                          >
                            {subject.name}
                          </Link>
                        ) : (
                          subject.name
                        ),
                    },
                    {
                      label: t('Namespace'),
                      getter: subject => subject.namespace,
                    },
                  ]}
                  reflectInURL="bindingInfo"
                />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}

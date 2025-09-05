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
import CRD from '../../lib/k8s/crd';
import Link from '../common/Link';
import { ConditionsTable, DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import DetailsViewSection from '../DetailsViewSection';
import { CustomResourceListTable } from './CustomResourceList';

export default function CustomResourceDefinitionDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={CRD}
      name={name}
      cluster={cluster}
      extraInfo={item =>
        item && [
          {
            name: t('translation|Group'),
            value: item.spec.group,
          },
          {
            name: t('translation|Version'),
            value: item.spec.version,
          },
          {
            name: t('Scope'),
            value: item.spec.scope,
          },
          {
            name: t('Subresources'),
            value: item.spec.subresources && Object.keys(item.spec.subresources).join(' & '),
            hide: !item.spec.subresources,
          },
          {
            name: t('Resource'),
            value: (
              <Link
                routeName="customresources"
                params={{
                  crd: item.metadata.name,
                }}
                activeCluster={item.cluster}
              >
                {item.spec.names.kind}
              </Link>
            ),
          },
          {
            name: t('translation|Categories'),
            value: item.getCategories().join(', '),
            hide: item.getCategories().length === 0,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.crd-accepted-names',
            section: (
              <SectionBox title={t('translation|Accepted Names')}>
                <SimpleTable
                  data={[item.spec.names]}
                  columns={[
                    {
                      label: t('Plural'),
                      datum: 'plural',
                    },
                    {
                      label: t('Singular'),
                      datum: 'singular',
                    },
                    {
                      label: t('glossary|Kind'),
                      datum: 'kind',
                    },
                    {
                      label: t('List Kind'),
                      datum: 'listKind',
                    },
                  ]}
                  reflectInURL="acceptedNames"
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.crd-versions',
            section: (
              <SectionBox title={t('translation|Versions')}>
                <SimpleTable
                  data={item.spec.versions}
                  columns={[
                    {
                      label: t('translation|Name'),
                      datum: 'name',
                    },
                    {
                      label: t('Served'),
                      getter: version => version.storage.toString(),
                    },
                    {
                      label: t('Storage'),
                      getter: version => version.storage.toString(),
                    },
                  ]}
                  reflectInURL="versions"
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.crd-conditions',
            section: (
              <SectionBox title={t('translation|Conditions')}>
                <ConditionsTable resource={item.jsonData} showLastUpdate={false} />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.crd-list',
            section: (
              <CustomResourceListTable title={t('Objects')} crd={item} includeCRDLink={false} />
            ),
          },
          {
            id: 'headlamp.crd-details',
            section: <DetailsViewSection resource={item} />,
          },
        ]
      }
      withEvents
    />
  );
}

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
import type { DeviceRequest } from '../../lib/k8s/resourceClaim';
import { getRequestedDeviceClasses } from '../../lib/k8s/resourceClaim';
import ResourceClaimTemplate from '../../lib/k8s/resourceClaimTemplate';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function ResourceClaimTemplateDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ResourceClaimTemplate}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraSections={item =>
        item && [
          {
            id: 'headlamp.resourceclaimtemplate-requests',
            section: (
              <SectionBox title={t('translation|Requests')}>
                <SimpleTable
                  columns={[
                    {
                      label: t('translation|Request'),
                      getter: (request: DeviceRequest) => request.name,
                    },
                    {
                      label: t('glossary|Device Classes'),
                      getter: (request: DeviceRequest) =>
                        getRequestedDeviceClasses(request).map((className, index) => (
                          <div key={`${className}-${index}`}>
                            <Link
                              routeName="deviceClass"
                              params={{ name: className }}
                              activeCluster={item.cluster}
                            >
                              {className}
                            </Link>
                          </div>
                        )),
                    },
                    {
                      label: t('translation|Count'),
                      gridTemplate: 'min-content',
                      getter: (request: DeviceRequest) =>
                        request.exactly
                          ? request.exactly.allocationMode === 'All'
                            ? t('translation|All')
                            : request.exactly.count ?? ''
                          : request.firstAvailable?.map(subrequest => (
                              <div key={subrequest.name}>
                                {subrequest.allocationMode === 'All'
                                  ? t('translation|All')
                                  : subrequest.count ?? ''}
                              </div>
                            )),
                    },
                  ]}
                  data={item.requests}
                  emptyMessage={t('translation|This template requests no devices.')}
                />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}

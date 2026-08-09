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
import ResourceClaim from '../../lib/k8s/resourceClaim';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function ResourceClaimDetails() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <DetailsGrid
      resourceType={ResourceClaim}
      name={name}
      namespace={namespace}
      withEvents
      extraSections={item =>
        item
          ? [
              <div key="details">
                {item.spec?.devices?.requests && (
                  <SectionBox title={t('Requests')}>
                    <SimpleTable
                      data={item.spec.devices.requests}
                      columns={[
                        {
                          label: t('Name'),
                          getter: (req: any) => req.name,
                        },
                        {
                          label: t('Device Class'),
                          getter: (req: any) => req.deviceClassName,
                        },
                        {
                          label: t('Allocation Mode'),
                          getter: (req: any) => req.allocationMode || '-',
                        },
                        {
                          label: t('Admin Access'),
                          getter: (req: any) => (req.adminAccess ? t('Yes') : t('No')),
                        },
                      ]}
                    />
                  </SectionBox>
                )}
                {item.status?.allocation?.devices?.results && (
                  <SectionBox title={t('Allocation Results')}>
                    <SimpleTable
                      data={item.status.allocation.devices.results}
                      columns={[
                        {
                          label: t('Request'),
                          getter: (res: any) => res.request,
                        },
                        {
                          label: t('Driver'),
                          getter: (res: any) => res.driver,
                        },
                        {
                          label: t('Pool'),
                          getter: (res: any) => res.pool,
                        },
                        {
                          label: t('Device'),
                          getter: (res: any) => res.device,
                        },
                      ]}
                    />
                  </SectionBox>
                )}
              </div>,
            ]
          : []
      }
    />
  );
}

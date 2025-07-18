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
import AdminNetworkPolicy from '../../lib/k8s/adminnetworkpolicy';
import ResourceListView from '../common/Resource/ResourceListView';

export default function AdminNetworkPolicyList() {
  const { t } = useTranslation(['glossary']);
  return (
    <>
      <ResourceListView
        title={t('Admin Network Policies')}
        resourceClass={AdminNetworkPolicy}
        columns={[
          'name',
          {
            id: 'priority',
            gridTemplate: 'auto',
            label: t('translation|Priority'),
            getValue: adminnetworkpolicy => adminnetworkpolicy?.jsonData?.spec?.priority ?? 'N/A',
          },
          {
            id: 'numberofrules',
            gridTemplate: 'auto',
            label: t('translation|Number of Rules'),
            getValue: adminnetworkpolicy =>
              adminnetworkpolicy?.jsonData?.spec?.egress?.length ??
              adminnetworkpolicy?.jsonData?.spec?.ingress?.length,
          },
          {
            id: 'subject',
            gridTemplate: 'auto',
            label: t('translation|Subject'),
            getValue: adminnetworkpolicy => {
              const subject = adminnetworkpolicy?.jsonData?.spec?.subject;
              if (!subject) return 'N/A';

              if (subject.namespaces) {
                const nsKeys = Object.keys(subject.namespaces);
                return `Namespaces: ${nsKeys.length > 0 ? nsKeys.join(', ') : 'All'}`;
              }

              if (subject.pods) {
                return `Pods: ${JSON.stringify(subject.pods)}`;
              }

              return 'Unknown Subject Format';
            },
          },
          'cluster',
          {
            id: 'type',
            gridTemplate: 'auto',
            label: t('translation|Type'),
            getValue: adminnetworkpolicy => {
              const isIngressAvailable =
                adminnetworkpolicy.jsonData.spec.ingress &&
                adminnetworkpolicy.jsonData.spec.ingress.length > 0;
              const isEgressAvailable =
                adminnetworkpolicy.jsonData.spec.egress &&
                adminnetworkpolicy.jsonData.spec.egress.length > 0;
              return isIngressAvailable && isEgressAvailable
                ? 'Ingress and Egress'
                : isIngressAvailable
                ? 'Ingress'
                : isEgressAvailable
                ? 'Egress'
                : 'None';
            },
          },
          'age',
        ]}
      />
    </>
  );
}

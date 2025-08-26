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
import BackendTLSPolicy from '../../lib/k8s/backendTLSPolicy';
import EmptyContent from '../common/EmptyContent';
import LabelListItem from '../common/LabelListItem';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';

export default function BackendTLSPolicyDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={BackendTLSPolicy}
      name={name}
      namespace={namespace}
      withEvents
      extraSections={(item: BackendTLSPolicy) =>
        item && [
          {
            id: 'backendtlspolicy.targets',
            section: (
              <SectionBox title={t('Targets')}>
                {item.targetRefs?.length > 0 ? (
                  <LabelListItem
                    labels={item.targetRefs.map(ref =>
                      ref.sectionName
                        ? `${ref.kind} (${ref.name}:${ref.sectionName})`
                        : `${ref.kind} (${ref.name})`
                    )}
                  />
                ) : (
                  <EmptyContent>{t('No targets defined')}</EmptyContent>
                )}
              </SectionBox>
            ),
          },
          {
            id: 'backendtlspolicy.validation',
            section: (
              <SectionBox title={t('TLS Validation')}>
                {item.validation ? (
                  <>
                    <LabelListItem labels={[`${t('Hostname')}: ${item.validation.hostname}`]} />
                    <LabelListItem
                      labels={item.validation.caCertificateRefs.map(ref =>
                        ref.name ? `${ref.kind} (${ref.name})` : `${ref.kind}`
                      )}
                    />
                  </>
                ) : (
                  <EmptyContent>{t('No validation settings')}</EmptyContent>
                )}
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}

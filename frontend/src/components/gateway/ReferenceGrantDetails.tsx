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
import ReferenceGrant from '../../lib/k8s/referenceGrant';
import EmptyContent from '../common/EmptyContent';
import LabelListItem from '../common/LabelListItem';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';

export default function ReferenceGrantDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ReferenceGrant}
      name={name}
      namespace={namespace}
      withEvents
      extraSections={(item: ReferenceGrant) =>
        item && [
          {
            id: 'headlamp.referencegrant-from',
            section: (
              <SectionBox title={t('From')}>
                {item.from?.length > 0 ? (
                  <LabelListItem labels={item.from.map(f => `${f.kind} (${f.namespace})`)} />
                ) : (
                  <EmptyContent>{t('No data')}</EmptyContent>
                )}
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.referencegrant-to',
            section: (
              <SectionBox title={t('To')}>
                {item.to?.length > 0 ? (
                  <LabelListItem
                    labels={item.to.map(t => `${t.kind}${t.name ? ` (${t.name})` : ''}`)}
                  />
                ) : (
                  <EmptyContent>{t('No data')}</EmptyContent>
                )}
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}

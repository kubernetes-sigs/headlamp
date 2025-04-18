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
import Secret from '../../lib/k8s/secret';
import { EmptyContent } from '../common';
import { DetailsGrid, SecretField } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import { NameValueTable, NameValueTableRow } from '../common/SimpleTable';

export default function SecretDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation();

  return (
    <DetailsGrid
      resourceType={Secret}
      name={name}
      namespace={namespace}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Type'),
            value: item.type,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.secrets-data',
            section: () => {
              const itemData = item?.data || {};
              const mainRows: NameValueTableRow[] = Object.entries(itemData).map(
                (item: unknown[]) => ({
                  name: item[0] as string,
                  value: <SecretField value={item[1]} />,
                })
              );
              return (
                <SectionBox title={t('translation|Data')}>
                  {mainRows.length === 0 ? (
                    <EmptyContent>{t('No data in this secret')}</EmptyContent>
                  ) : (
                    <NameValueTable rows={mainRows} />
                  )}
                </SectionBox>
              );
            },
          },
        ]
      }
    />
  );
}

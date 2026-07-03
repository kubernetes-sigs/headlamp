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

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { Base64 } from 'js-base64';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import Secret from '../../lib/k8s/secret';
import { clusterAction } from '../../redux/clusterActionSlice';
import { AppDispatch } from '../../redux/stores/store';
import EmptyContent from '../common/EmptyContent';
import { DetailsGrid, SecretField } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import { NameValueTable, NameValueTableRow } from '../common/SimpleTable';

interface SecretDataSectionProps {
  /** The Secret resource whose data fields are displayed and edited. */
  item: Secret;
}

function SecretDataSection({ item }: SecretDataSectionProps) {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

  const [data, setData] = React.useState<Record<string, string>>(() =>
    _.cloneDeep(item.data || {})
  );
  const [isDirty, setIsDirty] = React.useState(false);
  const lastDataRef = React.useRef<Record<string, string>>(_.cloneDeep(item.data || {}));

  React.useEffect(() => {
    const newData = _.cloneDeep(item.data || {});
    if (!isDirty && !_.isEqual(newData, lastDataRef.current)) {
      setData(newData);
      lastDataRef.current = newData;
    }
  }, [item.data, isDirty]);

  const handleFieldChange = (key: string, newValue: string) => {
    setData(prev => {
      const nextData = { ...prev, [key]: Base64.encode(newValue) };
      setIsDirty(!_.isEqual(nextData, lastDataRef.current));
      return nextData;
    });
  };

  const handleSave = () => {
    const updatedSecret = { ...item.jsonData, data };
    dispatch(
      clusterAction(() => item.update(updatedSecret), {
        startMessage: t('translation|Applying changes to {{ itemName }}…', {
          itemName: item.metadata.name,
        }),
        cancelledMessage: t('translation|Cancelled changes to {{ itemName }}.', {
          itemName: item.metadata.name,
        }),
        successMessage: t('translation|Applied changes to {{ itemName }}.', {
          itemName: item.metadata.name,
        }),
        errorMessage: t('translation|Failed to apply changes to {{ itemName }}.', {
          itemName: item.metadata.name,
        }),
      })
    );
    lastDataRef.current = _.cloneDeep(data);
    setIsDirty(false);
  };

  const mainRows: NameValueTableRow[] = Object.entries(data).map(([key, val]) => ({
    name: key,
    nameID: key,
    value: (
      <SecretField
        value={val}
        nameID={key}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          handleFieldChange(key, e.target.value)
        }
      />
    ),
  }));

  return (
    <SectionBox title={t('translation|Data')}>
      {mainRows.length === 0 ? (
        <EmptyContent>{t('No data in this secret')}</EmptyContent>
      ) : (
        <>
          <NameValueTable rows={mainRows} />
          <Box mt={2} display="flex" justifyContent="flex-end">
            <Button variant="contained" color="primary" onClick={handleSave}>
              {t('translation|Save')}
            </Button>
          </Box>
        </>
      )}
    </SectionBox>
  );
}

export default function SecretDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation();

  return (
    <DetailsGrid
      resourceType={Secret}
      name={name}
      namespace={namespace}
      cluster={cluster}
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
            section: () => <SecretDataSection item={item} />,
          },
        ]
      }
    />
  );
}

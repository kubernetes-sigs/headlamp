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

import Button from '@mui/material/Button';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import ConfigMap from '../../lib/k8s/configMap';
import { clusterAction } from '../../redux/clusterActionSlice';
import { AppDispatch } from '../../redux/stores/store';
import EmptyContent from '../common/EmptyContent';
import { DataField, DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import { NameValueTable, NameValueTableRow } from '../common/SimpleTable';

function ConfigMapDataSection({ item }: { item: ConfigMap }) {
  const { t } = useTranslation(['translation']);
  const dispatch: AppDispatch = useDispatch();

  const [data, setData] = React.useState(() => _.cloneDeep(item.data || {}));
  const [binaryData, setBinaryData] = React.useState(() => _.cloneDeep(item.binaryData || {}));
  const [isDirty, setIsDirty] = React.useState(false);
  const lastDataRef = React.useRef(_.cloneDeep(item.data || {}));
  const lastBinaryDataRef = React.useRef(_.cloneDeep(item.binaryData || {}));

  const handleDataFieldChange = (key: string, newValue: string) => {
    setData(prev => {
      const next = { ...prev, [key]: newValue };
      setIsDirty(
        !_.isEqual(next, lastDataRef.current) || !_.isEqual(binaryData, lastBinaryDataRef.current)
      );
      return next;
    });
  };

  const handleBinaryDataFieldChange = (key: string, newValue: string) => {
    setBinaryData(prev => {
      const next = { ...prev, [key]: newValue };
      setIsDirty(
        !_.isEqual(data, lastDataRef.current) || !_.isEqual(next, lastBinaryDataRef.current)
      );
      return next;
    });
  };

  React.useEffect(() => {
    const newData = _.cloneDeep(item.data || {});
    if (!isDirty && !_.isEqual(newData, lastDataRef.current)) {
      setData(newData);
      lastDataRef.current = newData;
    }
    const newBinaryData = _.cloneDeep(item.binaryData || {});
    if (!isDirty && !_.isEqual(newBinaryData, lastBinaryDataRef.current)) {
      setBinaryData(newBinaryData);
      lastBinaryDataRef.current = newBinaryData;
    }
  }, [item.data, item.binaryData, isDirty]);

  const handleSave = () => {
    const updatedConfigMap = { ...item.jsonData, data, binaryData };
    dispatch(
      clusterAction(() => item.update(updatedConfigMap), {
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
    lastBinaryDataRef.current = _.cloneDeep(binaryData);
    setIsDirty(false);
  };

  const dataRows: NameValueTableRow[] = Object.entries(data).map(([key, value]) => ({
    name: key,
    value: (
      <DataField
        label={key}
        disableLabel
        value={value}
        onChange={(newValue: string) => handleDataFieldChange(key, newValue)}
      />
    ),
  }));

  const binaryDataRows: NameValueTableRow[] = Object.entries(binaryData).map(([key, value]) => ({
    name: key,
    value: (
      <DataField
        label={key}
        disableLabel
        value={value}
        onChange={(newValue: string) => handleBinaryDataFieldChange(key, newValue)}
      />
    ),
  }));

  return (
    <>
      <SectionBox title={t('translation|Data')}>
        {dataRows.length === 0 ? (
          <EmptyContent>{t('No data in this config map')}</EmptyContent>
        ) : (
          <NameValueTable rows={dataRows} />
        )}
      </SectionBox>
      <SectionBox title={t('translation|Binary Data')}>
        {binaryDataRows.length === 0 ? (
          <EmptyContent>{t('No binary data in this config map')}</EmptyContent>
        ) : (
          <NameValueTable rows={binaryDataRows} />
        )}
      </SectionBox>
      {binaryDataRows.length + dataRows.length > 0 && (
        <SectionBox display="flex" justifyContent="flex-end">
          <Button variant="contained" color="primary" onClick={handleSave}>
            {t('translation|Save')}
          </Button>
        </SectionBox>
      )}
    </>
  );
}

export default function ConfigDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;

  return (
    <DetailsGrid
      resourceType={ConfigMap}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraSections={item =>
        item && [
          {
            id: 'headlamp.configmap-data',
            section: () => <ConfigMapDataSection item={item} />,
          },
        ]
      }
    />
  );
}

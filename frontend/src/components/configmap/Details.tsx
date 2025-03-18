import { Box, Button } from '@mui/material';
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

export default function ConfigDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation(['translation']);
  const dispatch: AppDispatch = useDispatch();

  return (
    <DetailsGrid
      resourceType={ConfigMap}
      name={name}
      namespace={namespace}
      withEvents
      extraSections={item =>
        item && [
          {
            id: 'headlamp.configmap-data',
            section: () => {
              const [data, setData] = React.useState(() => _.cloneDeep(item.data));
              const [isDirty, setIsDirty] = React.useState(false);
              const lastDataRef = React.useRef(_.cloneDeep(item.data));

              const handleFieldChange = (key: string, newValue: string) => {
                setData(prev => ({ ...prev, [key]: newValue }));
                setIsDirty(true);
              };

              React.useEffect(() => {
                const newData = _.cloneDeep(item.data);
                if (!isDirty && !_.isEqual(newData, lastDataRef.current)) {
                  setData(newData);
                  lastDataRef.current = newData;
                }
              }, [item.data, isDirty]);

              const handleSave = () => {
                const updatedConfigMap = { ...item.jsonData, data };
                dispatch(
                  clusterAction(() => item.update(updatedConfigMap), {
                    startMessage: t('translation|Applying changes to {{ name }}…', {
                      name: item.metadata.name,
                    }),
                    cancelledMessage: t('translation|Cancelled changes to {{ name }}.', {
                      name: item.metadata.name,
                    }),
                    successMessage: t('translation|Applied changes to {{ name }}.', {
                      name: item.metadata.name,
                    }),
                    errorMessage: t('translation|Failed to apply changes to {{ name }}.', {
                      name: item.metadata.name,
                    }),
                  })
                );
                lastDataRef.current = _.cloneDeep(data);
                setIsDirty(false);
              };

              const mainRows: NameValueTableRow[] = Object.entries(data).map((item: unknown[]) => ({
                name: item[0] as string,
                value: (
                  <DataField
                    label={item[0] as string}
                    disableLabel
                    value={item[1]}
                    onChange={(newValue: string) => handleFieldChange(item[0] as string, newValue)}
                  />
                ),
              }));

              return (
                <SectionBox title={t('translation|Data')}>
                  {mainRows.length === 0 ? (
                    <EmptyContent>{t('No data in this config map')}</EmptyContent>
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
            },
          },
        ]
      }
    />
  );
}

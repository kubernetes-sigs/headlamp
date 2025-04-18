import { Box, Button } from '@mui/material';
import { Base64 } from 'js-base64';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import Secret from '../../lib/k8s/secret';
import { clusterAction } from '../../redux/clusterActionSlice';
import { AppDispatch } from '../../redux/stores/store';
import { EmptyContent } from '../common';
import { DetailsGrid, SecretField } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import { NameValueTable, NameValueTableRow } from '../common/SimpleTable';

export default function SecretDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

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
              const initialData = _.mapValues(item.data, (v: string) => Base64.decode(v));
              const [data, setData] = React.useState(initialData);
              const lastDataRef = React.useRef(initialData);

              React.useEffect(() => {
                const newData = _.mapValues(item.data, (v: string) => Base64.decode(v));
                if (!_.isEqual(newData, lastDataRef.current)) {
                  if (_.isEqual(data, lastDataRef.current)) {
                    setData(newData);
                    lastDataRef.current = newData;
                  }
                }
              }, [item.data]);

              const handleFieldChange = (key: string, newValue: string) => {
                setData(prev => ({ ...prev, [key]: newValue }));
              };

              const handleSave = () => {
                const encodedData = _.mapValues(data, (v: string) => Base64.encode(v));
                const updatedSecret = { ...item.jsonData, data: encodedData };
                dispatch(
                  clusterAction(() => item.update(updatedSecret), {
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
              };

              const mainRows: NameValueTableRow[] = Object.entries(data).map((item: unknown[]) => ({
                name: item[0] as string,
                value: (
                  <SecretField
                    value={item[1]}
                    onChange={e => handleFieldChange(item[0] as string, e.target.value)}
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
            },
          },
        ]
      }
    />
  );
}

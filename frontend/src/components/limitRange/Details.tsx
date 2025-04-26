import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { LimitRange } from '../../lib/k8s/limitRange';
import { DetailsGrid, MetadataDictGrid } from '../common';

export function LimitRangeDetails(props: { name?: string; namespace?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['translation']);
  return (
    <DetailsGrid
      resourceType={LimitRange}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Container Limits'),
            value: (
              <>
                <Box m={1}>
                  <Typography variant="h6">{t('translation|Default')}</Typography>
                  <MetadataDictGrid dict={item?.jsonData?.spec?.limits?.[0]?.default} />
                </Box>
                <Box m={1}>
                  <Typography variant="h6">{t('translation|Default Request')}</Typography>
                  <MetadataDictGrid dict={item?.jsonData?.spec?.limits?.[0]?.defaultRequest} />
                </Box>
                <Box m={1}>
                  <Typography variant="h6">{t('translation|Max')}</Typography>
                  <MetadataDictGrid dict={item?.jsonData?.spec?.limits?.[0]?.max} />
                </Box>
                <Box m={1}>
                  <Typography variant="h6">{t('translation|Min')}</Typography>
                  <MetadataDictGrid dict={item?.jsonData?.spec?.limits?.[0]?.min} />
                </Box>
              </>
            ),
          },
        ]
      }
    />
  );
}

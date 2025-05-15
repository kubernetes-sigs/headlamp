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

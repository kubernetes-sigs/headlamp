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
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { LimitRange } from '../../lib/k8s/limitRange';
import { DetailsGrid } from '../common/Resource';
import { MetadataDictGrid } from '../common/Resource';

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
        item &&
        (item?.jsonData?.spec?.limits ?? []).map(limit => ({
          name: t('translation|{{ type }} Limits', { type: limit.type }),
          value: (
            <>
              <Box m={1}>
                <Typography variant="h6">{t('translation|Default')}</Typography>
                <MetadataDictGrid dict={limit.default} />
              </Box>
              <Box m={1}>
                <Typography variant="h6">{t('translation|Default Request')}</Typography>
                <MetadataDictGrid dict={limit.defaultRequest} />
              </Box>
              <Box m={1}>
                <Typography variant="h6">{t('translation|Max')}</Typography>
                <MetadataDictGrid dict={limit.max} />
              </Box>
              <Box m={1}>
                <Typography variant="h6">{t('translation|Min')}</Typography>
                <MetadataDictGrid dict={limit.min} />
              </Box>
              {limit.maxLimitRequestRatio && (
                <Box m={1}>
                  <Typography variant="h6">{t('translation|Max Limit/Request Ratio')}</Typography>
                  <MetadataDictGrid dict={limit.maxLimitRequestRatio} />
                </Box>
              )}
            </>
          ),
        }))
      }
    />
  );
}

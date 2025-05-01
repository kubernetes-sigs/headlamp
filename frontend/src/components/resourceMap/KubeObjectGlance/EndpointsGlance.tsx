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

import { Box } from '@mui/system';
import { useTranslation } from 'react-i18next';
import Endpoints from '../../../lib/k8s/endpoints';
import { StatusLabel } from '../../common';

export function EndpointsGlance({ endpoints }: { endpoints: Endpoints }) {
  const { t } = useTranslation();
  const addresses = endpoints.subsets?.flatMap(it => it.addresses?.map(it => it.ip)) ?? [];
  const ports = endpoints.subsets?.flatMap(it => it.ports) ?? [];

  return (
    <Box display="flex" gap={1} alignItems="center" mt={2} flexWrap="wrap" key="endpoints">
      <StatusLabel status="">
        {t('Addresses')}: {addresses.join(', ')}
      </StatusLabel>
      {ports.map(it =>
        it ? (
          <StatusLabel status="" key={it.protocol + it.port}>
            {it.protocol}:{it.port}
          </StatusLabel>
        ) : null
      )}
    </Box>
  );
}

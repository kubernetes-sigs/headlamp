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
import HPA from '../../../lib/k8s/hpa';
import { StatusLabel } from '../../common/Label';

export function HorizontalPodAutoscalerGlance({ hpa }: { hpa: HPA }) {
  const { t } = useTranslation();
  const currentReplicas = hpa.status?.currentReplicas || 0;
  const desiredReplicas = hpa.status?.desiredReplicas || 0;
  const minReplicas = hpa.spec?.minReplicas || 0;
  const maxReplicas = hpa.spec?.maxReplicas || 0;

  return (
    <Box display="flex" gap={1} alignItems="center" mt={2} flexWrap="wrap" key="hpa">
      <StatusLabel status="">
        {t('glossary|Current')}: {currentReplicas}
      </StatusLabel>
      <StatusLabel status="">
        {t('glossary|Desired')}: {desiredReplicas}
      </StatusLabel>
      <StatusLabel status="">
        {`${t('glossary|Min')}/${t('glossary|Max')}`}: {minReplicas}/{maxReplicas}
      </StatusLabel>
      {hpa.status?.conditions?.map((condition, index) => (
        <StatusLabel status="" key={`${condition.type}-${index}`}>
          {condition.type}
        </StatusLabel>
      ))}
    </Box>
  );
}

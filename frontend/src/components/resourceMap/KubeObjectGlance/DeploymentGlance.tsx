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
import { KubeCondition } from '../../../lib/k8s/cluster';
import Deployment from '../../../lib/k8s/deployment';
import { StatusLabel } from '../../common/Label';

export function DeploymentGlance({ deployment }: { deployment: Deployment }) {
  const { t } = useTranslation();
  const { replicas, availableReplicas } = deployment.status;
  const pods = `${availableReplicas || 0}/${replicas || 0}`;

  return (
    <Box display="flex" gap={1} alignItems="center" mt={2} flexWrap="wrap" key="deployment">
      <StatusLabel status="">
        {t('glossary|Pods')}: {pods}
      </StatusLabel>
      {deployment.status.conditions.map((it: KubeCondition) => (
        <StatusLabel status="" key={it.type}>
          {it.type}
        </StatusLabel>
      ))}
    </Box>
  );
}

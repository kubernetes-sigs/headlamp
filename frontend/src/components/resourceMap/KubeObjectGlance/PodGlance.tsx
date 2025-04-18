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
import Pod from '../../../lib/k8s/pod';
import { StatusLabel } from '../../common';
import { makePodStatusLabel } from '../../pod/List';

export function PodGlance({ pod }: { pod: Pod }) {
  const { t } = useTranslation();
  return (
    <Box display="flex" gap={1} alignItems="center" mt={2} flexWrap="wrap" key="pod">
      <Box>{makePodStatusLabel(pod)}</Box>
      {pod.spec.containers.map(it => (
        <StatusLabel status="" key={it.name}>
          {t('glossary|Container')}: {it.name}
        </StatusLabel>
      ))}
      {pod.status?.podIP && <StatusLabel status="">IP: {pod.status?.podIP}</StatusLabel>}
    </Box>
  );
}

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
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/system';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Node from '../../lib/k8s/node';

const WrappingBox = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'left',
  flexWrap: 'wrap',
  overflow: 'hidden',
  '& > *': {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
}));

const PaddedChip = styled(Chip)({
  paddingTop: '2px',
  paddingBottom: '2px',
});

export function formatTaint(taint: { key: string; value?: string; effect: string }) {
  return `${taint.key}${taint.value ? '=' + taint.value : ''}:${taint.effect}`;
}

export function NodeTaintsLabel(props: { node: Node }) {
  const { node } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  if (node.spec?.taints === undefined) {
    return <WrappingBox>{t('translation|None')}</WrappingBox>;
  }
  const limits: ReactNode[] = [];
  node.spec.taints.forEach(taint => {
    const format = formatTaint(taint);
    limits.push(
      <Tooltip title={format} key={taint.key}>
        <PaddedChip label={format} variant="outlined" size="small" />
      </Tooltip>
    );
  });
  return <WrappingBox>{limits}</WrappingBox>;
}

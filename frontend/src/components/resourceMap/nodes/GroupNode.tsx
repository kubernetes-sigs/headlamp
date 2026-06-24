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
import { styled } from '@mui/material/styles';
import { alpha } from '@mui/system/colorManipulator';
import { memo } from 'react';
import { useGraphView, useNode } from '../GraphView';
import { KubeIcon } from '../kubeIcon/KubeIcon';

const Container = styled('div')(({ theme }) => ({
  width: '100%',
  height: '100%',
  background: alpha(theme.palette.background.paper, 0.6),
  border: '1px solid',
  borderColor: theme.palette.divider,
  borderRadius: theme.spacing(1.5),
}));

const Label = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  position: 'absolute',
  gap: '4px',
  fontSize: '16px',
  top: 0,
  left: 0,
  padding: '8px 12px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  width: '100%',
  borderRadius: 4,
}));

export const GroupNodeComponent = memo(({ id }: { id: string }) => {
  const graph = useGraphView();
  const node = useNode(id);

  const kubeObject = node?.kubeObject;

  const apiGroup =
    kubeObject?.jsonData?.apiVersion && kubeObject.jsonData.apiVersion.includes('/')
      ? kubeObject.jsonData.apiVersion.split('/')[0]
      : 'core';

  const handleSelect = () => {
    graph.setNodeSelection(id);
  };

  return (
    <Container
      tabIndex={0}
      role="button"
      onClick={handleSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Space') {
          handleSelect();
        }
      }}
    >
      {(node?.label || node?.subtitle) && (
        <Label title={node?.label}>
          {node?.kubeObject ? (
            <KubeIcon kind={node.kubeObject.kind} apiGroup={apiGroup} width="24px" height="24px" />
          ) : (
            node?.icon ?? null
          )}
          <Box sx={{ opacity: 0.8 }}>{node?.subtitle}</Box>
          <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node?.label}</Box>
        </Label>
      )}
    </Container>
  );
});

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
import Card from '@mui/material/Card';
import { useTranslation } from 'react-i18next';
import ActionButton from '../../common/ActionButton';
import { GraphNode } from '../graph/graphModel';
import { KubeObjectDetails } from './KubeNodeDetails';

export interface GraphNodeDetailsProps {
  /** Node to display */
  node?: GraphNode;
  /** Callback when the panel is closed */
  close: () => void;
}

/**
 * Side panel display information about a selected Node
 */
export function GraphNodeDetails({ node, close }: GraphNodeDetailsProps) {
  const { t } = useTranslation();

  if (!node) return null;

  const hasContent = node.detailsComponent || node.kubeObject;
  if (!hasContent) return null;

  return (
    <Card
      elevation={0}
      sx={theme => ({
        margin: '0',
        padding: '1rem',
        width: '900px',
        overflowY: 'auto',
        flexShrink: 0,
        borderLeft: '1px solid',
        borderColor: theme.palette.divider,
        [theme.breakpoints.down('xl')]: {
          width: '720px',
        },
        [theme.breakpoints.down('lg')]: {
          position: 'absolute',
          width: '100%',
          minWidth: '100%',
        },
      })}
    >
      <Box textAlign="right">
        <ActionButton
          onClick={() => {
            close();
          }}
          icon="mdi:close"
          description={t('Close')}
        />
      </Box>

      {node.detailsComponent && <node.detailsComponent node={node} />}
      {node.kubeObject && (
        <KubeObjectDetails
          resource={node.kubeObject}
          customResourceDefinition={node.customResourceDefinition}
        />
      )}
    </Card>
  );
}

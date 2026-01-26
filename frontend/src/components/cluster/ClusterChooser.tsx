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

import { Icon } from '@iconify/react';
import Button from '@mui/material/Button';
import { alpha, styled } from '@mui/system';
import React, { ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';

export interface ClusterChooserProps {
  clickHandler: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  cluster?: string;
}
export type ClusterChooserType =
  | React.ComponentType<ClusterChooserProps>
  | ReactElement<ClusterChooserProps>
  | null;

const SpanClusterName = styled('span')({
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  display: 'block',
});

const ClusterChooser = React.forwardRef(function ClusterChooser(
  { clickHandler, cluster }: ClusterChooserProps,
  ref: React.Ref<HTMLButtonElement>
) {
  const { t } = useTranslation();

  return (
    <Button
      size="large"
      color="secondary"
      onClick={clickHandler}
      startIcon={<Icon icon="mdi:magnify" />}
      endIcon={<Icon icon="mdi:chevron-down" width={18} />}
      sx={theme => ({
        background: alpha(theme.palette.primary.main, 0.1),
        color: theme.palette.navbar.color,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        ':hover': {
          background: alpha(theme.palette.primary.main, 0.15),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
          transform: 'translateY(-1px)',
          boxShadow: theme.shadows[2],
        },
        transition: 'all 0.2s ease-in-out',
        maxWidth: '20em',
        textTransform: 'none',
        padding: '6px 16px',
        fontWeight: 500,
        gap: 1,
      })}
      ref={ref}
    >
      <SpanClusterName title={cluster}>
        <Trans t={t}>Cluster: {{ cluster }}</Trans>
      </SpanClusterName>
    </Button>
  );
});

export default ClusterChooser;

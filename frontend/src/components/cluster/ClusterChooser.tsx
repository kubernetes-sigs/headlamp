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

import Button from '@mui/material/Button';
import { alpha } from '@mui/system';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import ClusterBadge from '../Sidebar/ClusterBadge';

export interface ClusterChooserProps {
  clickHandler: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  cluster?: string;
  icon?: string;
  accentColor?: string;
}
export type ClusterChooserType =
  | React.ComponentType<ClusterChooserProps>
  | ReactElement<ClusterChooserProps>
  | null;

const ClusterChooser = React.forwardRef(function ClusterChooser(
  { clickHandler, cluster, icon, accentColor }: ClusterChooserProps,
  ref: React.Ref<HTMLButtonElement>
) {
  const { t } = useTranslation();

  return (
    <Button
      size="large"
      color="secondary"
      onClick={clickHandler}
      sx={theme => ({
        background: theme.palette.navbar.background,
        color: theme.palette.navbar.color,
        ':hover': {
          background: alpha(theme.palette.navbar.color, 0.07),
        },
        textTransform: 'none',
        padding: '6px 22px',
      })}
      ref={ref}
    >
      <ClusterBadge name={cluster || t('Cluster')} icon={icon} accentColor={accentColor} />
    </Button>
  );
});

export default ClusterChooser;

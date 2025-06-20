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
import React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTypedSelector } from '../../redux/hooks';
import ClusterChooserPopup from '../cluster/ClusterChooserPopup';

/**
 * Action component for cluster sidebar items.
 * This shows an ellipsis icon that opens the cluster chooser popup.
 * Only displays when no plugin has registered a custom cluster chooser button,
 * whose default button component used to be displayed at the top bar.
 */
export const ClusterChooserAction: React.FC = () => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const ChooserButton = useTypedSelector(state => state.ui.clusterChooserButtonComponent);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  useHotkeys(
    'ctrl+shift+l',
    () => {
      // Only open popup if no plugin has registered a custom cluster chooser button
      if (!ChooserButton) {
        setAnchorEl(buttonRef.current);
      }
    },
    { preventDefault: true }
  );

  // Don't render if a plugin has registered a custom cluster chooser button
  if (ChooserButton) {
    return null;
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent both default action and event propagation to avoid sidebar navigation
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Button
        ref={buttonRef}
        variant="outlined"
        sx={{
          minWidth: 'unset',
          px: 0.5,
        }}
        onClick={handleClick}
      >
        <Icon icon="mdi:dots-horizontal" width={16} height={16} />
      </Button>
      <ClusterChooserPopup anchor={anchorEl} onClose={handleClose} />
    </>
  );
};

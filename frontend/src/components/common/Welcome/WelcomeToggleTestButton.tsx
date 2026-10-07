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

// TEST-ONLY: temporary button to toggle the welcome dialog's dismissed flag.
// Remove this file (and its usage in TopBar) during cleanup.

import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';
import { WELCOME_DISMISSED_STORAGE_KEY, WELCOME_FORCE_SHOW_STORAGE_KEY } from './Welcome';

export default function WelcomeToggleTestButton() {
  // Drives the force-show override so the welcome appears even with clusters already running.
  const [forceShow, setForceShow] = React.useState(
    () => localStorage.getItem(WELCOME_FORCE_SHOW_STORAGE_KEY) === 'true'
  );

  const toggle = () => {
    const next = !forceShow;
    if (next) {
      // Force the welcome to show, overriding the dismissed/usage checks.
      localStorage.setItem(WELCOME_FORCE_SHOW_STORAGE_KEY, 'true');
      localStorage.removeItem(WELCOME_DISMISSED_STORAGE_KEY);
    } else {
      localStorage.removeItem(WELCOME_FORCE_SHOW_STORAGE_KEY);
      localStorage.setItem(WELCOME_DISMISSED_STORAGE_KEY, 'true');
    }
    setForceShow(next);
    // Welcome only reads the flags on mount, so reload to re-evaluate.
    window.location.reload();
  };

  return (
    <Tooltip
      title={
        forceShow
          ? 'TEST: welcome forced on — click to dismiss'
          : 'TEST: welcome off — click to force show'
      }
    >
      <Button
        onClick={toggle}
        color="inherit"
        size="small"
        variant="outlined"
        aria-label="Toggle welcome dialog (test)"
      >
        test
      </Button>
    </Tooltip>
  );
}

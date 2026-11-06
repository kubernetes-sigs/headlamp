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

import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClusterSettings,
  loadClusterSettings,
  storeClusterSettings,
} from '../../../helpers/clusterSettings';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import NodeShellSettings from './NodeShellSettings';

const theme = createMuiTheme({ name: 'Light', base: 'light' });

function renderSettings(clusterSettings: ClusterSettings = {}) {
  const setClusterSettings = vi.fn<React.Dispatch<React.SetStateAction<ClusterSettings>>>();

  render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <NodeShellSettings
          cluster="test"
          clusterSettings={clusterSettings}
          setClusterSettings={setClusterSettings}
        />
      </ThemeProvider>
    </TestContext>
  );

  return setClusterSettings;
}

describe('NodeShellSettings', () => {
  afterEach(() => {
    localStorage.removeItem('cluster_settings.test');
  });

  it('defaults host chroot to off and persists it when enabled', () => {
    const setClusterSettings = renderSettings();
    const toggle = screen.getByRole('checkbox', { name: /Chroot to host$/ });

    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    expect(setClusterSettings).toHaveBeenCalledTimes(1);
    const update = setClusterSettings.mock.calls[0][0];
    if (typeof update !== 'function') {
      throw new Error('Expected a functional cluster settings updater');
    }
    const settings = update({});
    expect(settings).toEqual({ nodeShellTerminal: { chrootHostRoot: true } });

    storeClusterSettings('test', settings);
    expect(loadClusterSettings('test')).toEqual(settings);
  });

  it.each([false, true])(
    'toggles host chroot from %s while preserving other settings',
    chrootHostRoot => {
      const settings: ClusterSettings = {
        defaultNamespace: 'app',
        nodeShellTerminal: {
          isEnabled: true,
          linuxImage: 'busybox',
          namespace: 'kube-system',
          chrootHostRoot,
        },
        podDebugTerminal: { isEnabled: false, debugImage: 'alpine' },
      };
      const setClusterSettings = renderSettings(settings);
      const toggle = screen.getByRole('checkbox', { name: /Chroot to host$/ });

      expect(toggle).toHaveProperty('checked', chrootHostRoot);
      fireEvent.click(toggle);

      expect(setClusterSettings).toHaveBeenCalledTimes(1);
      const update = setClusterSettings.mock.calls[0][0];
      if (typeof update !== 'function') {
        throw new Error('Expected a functional cluster settings updater');
      }
      const latestSettings = { ...settings, currentName: 'Production' };
      expect(update(latestSettings)).toEqual({
        ...latestSettings,
        nodeShellTerminal: { ...settings.nodeShellTerminal, chrootHostRoot: !chrootHostRoot },
      });
    }
  );
});

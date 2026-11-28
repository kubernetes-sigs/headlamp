/*
 * Copyright 2026 The Kubernetes Authors
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
import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { ClusterSettings } from '../../../helpers/clusterSettings';
import { createMuiTheme } from '../../../lib/themes';
import type { AdminSettingsState, DisplayMode } from '../../../settings/adminSettingsSlice';
import { initialAdminSettingsState } from '../../../settings/adminSettingsSlice';
import { lightTheme } from '../defaultAppThemes';
import NodeShellSettings from './NodeShellSettings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

const CLUSTER = 'my-cluster';
const IMAGE_PATH = 'clusters.*.nodeShellTerminal.linuxImage';
const ENABLED_PATH = 'clusters.*.nodeShellTerminal.isEnabled';
const NAMESPACE_PATH = 'clusters.*.nodeShellTerminal.namespace';

const adminDefaults = {
  clusters: {
    '*': {
      nodeShellTerminal: {
        linuxImage: 'admin-image:1',
        isEnabled: false,
        namespace: 'admin-ns',
      },
    },
  },
};

function renderSettings(
  adminSettings: Partial<AdminSettingsState>,
  clusterSettings: ClusterSettings = {}
) {
  const store = configureStore({
    reducer: (state: any) => state,
    preloadedState: {
      config: { settings: {} },
      adminSettings: { ...initialAdminSettingsState, ...adminSettings },
    } as any,
  });

  render(
    <Provider store={store}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <NodeShellSettings
          cluster={CLUSTER}
          clusterSettings={clusterSettings}
          setClusterSettings={vi.fn()}
        />
      </ThemeProvider>
    </Provider>
  );
}

const linuxImageInput = () => screen.getByLabelText('Linux image');
const nodeShellSwitch = () => screen.getByRole('checkbox');
const namespaceInput = () => screen.getByLabelText('Namespace');

describe('NodeShellSettings admin-managed settings', () => {
  it('uses the user value when no admin settings are configured', () => {
    renderSettings({}, { nodeShellTerminal: { linuxImage: 'user-image:2', isEnabled: true } });

    expect(linuxImageInput()).toHaveValue('user-image:2');
    expect(linuxImageInput()).toBeEnabled();
    expect(nodeShellSwitch()).toBeChecked();
  });

  it('prefers the user value over the admin default in normal mode', () => {
    renderSettings(
      { defaults: adminDefaults },
      { nodeShellTerminal: { linuxImage: 'user-image:2', isEnabled: true } }
    );

    expect(linuxImageInput()).toHaveValue('user-image:2');
    expect(linuxImageInput()).toBeEnabled();
    expect(nodeShellSwitch()).toBeChecked();
  });

  it('falls back to the admin default when the user has no value', () => {
    renderSettings({ defaults: adminDefaults });

    expect(linuxImageInput()).toHaveValue('admin-image:1');
    expect(nodeShellSwitch()).not.toBeChecked();
  });

  it('forces the admin value and disables the field when the setting is disabled', () => {
    const display: Record<string, DisplayMode> = {
      [IMAGE_PATH]: 'disabled',
      [ENABLED_PATH]: 'disabled',
    };

    renderSettings(
      { defaults: adminDefaults, display },
      { nodeShellTerminal: { linuxImage: 'user-image:2', isEnabled: true } }
    );

    expect(linuxImageInput()).toHaveValue('admin-image:1');
    expect(linuxImageInput()).toBeDisabled();
    expect(nodeShellSwitch()).not.toBeChecked();
    expect(nodeShellSwitch()).toBeDisabled();
  });

  it('does not render settings hidden by the admin', () => {
    const display: Record<string, DisplayMode> = {
      [IMAGE_PATH]: 'hidden',
      [ENABLED_PATH]: 'hidden',
    };

    renderSettings(
      { defaults: adminDefaults, display },
      { nodeShellTerminal: { linuxImage: 'user-image:2', isEnabled: true } }
    );

    expect(screen.queryByLabelText('Linux image')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
  });

  it('prefers a cluster-defined value over the admin default', () => {
    renderSettings({
      defaults: adminDefaults,
      clusterDefinedSettings: [CLUSTER],
      clusterSettings: { [CLUSTER]: { nodeShellTerminal: { linuxImage: 'cluster-image:3' } } },
    });

    expect(linuxImageInput()).toHaveValue('cluster-image:3');
  });

  it('falls back to admin default for namespace when user has no stored value', () => {
    renderSettings({ defaults: adminDefaults });
    expect(namespaceInput()).toHaveValue('admin-ns');
    expect(namespaceInput()).toBeEnabled();
  });

  it('uses user namespace value in normal mode', () => {
    renderSettings({ defaults: adminDefaults }, { nodeShellTerminal: { namespace: 'user-ns' } });
    expect(namespaceInput()).toHaveValue('user-ns');
    expect(namespaceInput()).toBeEnabled();
  });

  it('forces admin namespace default and disables field when disabled', () => {
    renderSettings(
      { defaults: adminDefaults, display: { [NAMESPACE_PATH]: 'disabled' } },
      { nodeShellTerminal: { namespace: 'user-ns' } }
    );
    expect(namespaceInput()).toHaveValue('admin-ns');
    expect(namespaceInput()).toBeDisabled();
  });

  it('hides namespace field when hidden by admin', () => {
    renderSettings(
      { defaults: adminDefaults, display: { [NAMESPACE_PATH]: 'hidden' } },
      { nodeShellTerminal: { namespace: 'user-ns' } }
    );
    expect(screen.queryByLabelText('Namespace')).not.toBeInTheDocument();
  });

  it('treats empty local namespace and linuxImage strings as unset and falls back to admin defaults', () => {
    renderSettings(
      { defaults: adminDefaults },
      { nodeShellTerminal: { namespace: '', linuxImage: '' } }
    );
    expect(namespaceInput()).toHaveValue('admin-ns');
    expect(linuxImageInput()).toHaveValue('admin-image:1');
  });
});

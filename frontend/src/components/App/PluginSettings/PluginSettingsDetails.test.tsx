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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { PluginInfo, setPluginSettings } from '../../../plugin/pluginsSlice';
import { HeadlampEventType } from '../../../redux/headlampEventSlice';
import store from '../../../redux/stores/store';
import { recordHeadlampEvents, TestContext } from '../../../test';
import PluginSettingsDetails, { PluginSettingsDetailsPure } from './PluginSettingsDetails';

const { mockPush, mockIsElectronRef } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockIsElectronRef: { current: false },
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    useHistory: () => ({ push: mockPush }),
  };
});

vi.mock('../../../helpers/isElectron', () => ({
  isElectron: () => mockIsElectronRef.current,
}));

const theme = createMuiTheme({ name: 'Light', base: 'light' });

const plugin: PluginInfo = {
  name: 'my-plugin',
  description: 'A plugin',
  isEnabled: true,
  isCompatible: true,
  isLoaded: true,
  type: 'user',
  homepage: '',
};

describe('PluginSettingsDetails metadata', () => {
  it.each(['@headlamp-k8s/my-plugin', 'my-plugin'])(
    'shows publisher metadata only for scoped plugin names: %s',
    name => {
      render(
        <TestContext>
          <ThemeProvider theme={theme}>
            <PluginSettingsDetailsPure plugin={{ ...plugin, name }} onDelete={() => {}} />
          </ThemeProvider>
        </TestContext>
      );

      if (name.startsWith('@')) {
        expect(screen.getByText('Published by headlamp-k8s')).toBeVisible();
      } else {
        expect(screen.queryByText(/Published by/)).not.toBeInTheDocument();
      }
    }
  );
});

describe('PluginSettingsDetails events', () => {
  it('dispatches PLUGIN_DETAILS_VIEW with the displayed plugin', async () => {
    store.dispatch(setPluginSettings([plugin]));
    const events = recordHeadlampEvents();

    render(
      <TestContext routerMap={{ name: plugin.name }}>
        <ThemeProvider theme={theme}>
          <PluginSettingsDetails />
        </ThemeProvider>
      </TestContext>
    );

    await waitFor(() => {
      expect(events.filter(e => e.type === HeadlampEventType.PLUGIN_DETAILS_VIEW)).toEqual([
        { type: HeadlampEventType.PLUGIN_DETAILS_VIEW, data: { plugin } },
      ]);
    });
  });

  it('renders NotFound when plugin does not exist and matches by name + type when provided', () => {
    const devPlugin: PluginInfo = { ...plugin, name: 'multi-plugin', type: 'development' };
    const shippedPlugin: PluginInfo = { ...plugin, name: 'multi-plugin', type: 'shipped' };
    store.dispatch(setPluginSettings([shippedPlugin, devPlugin]));

    render(
      <TestContext routerMap={{ name: 'missing-plugin' }}>
        <ThemeProvider theme={theme}>
          <PluginSettingsDetails />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText(/Whoops! This page doesn't exist/)).toBeInTheDocument();

    render(
      <TestContext routerMap={{ name: 'multi-plugin', type: 'development' }}>
        <ThemeProvider theme={theme}>
          <PluginSettingsDetails />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Development')).toBeInTheDocument();
  });
});

describe('PluginSettingsDetailsPure branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectronRef.current = false;
  });

  it.each([
    {
      type: 'development' as const,
      label: 'Development',
      overriddenBy: 'user' as const,
      overriddenText: 'user-installed',
    },
    {
      type: 'user' as const,
      label: 'User-installed',
      overriddenBy: 'shipped' as const,
      overriddenText: 'shipped',
    },
    {
      type: 'shipped' as const,
      label: 'Shipped',
      overriddenBy: 'development' as const,
      overriddenText: 'development',
    },
  ])(
    'renders type chip and Not Loaded banner for $type',
    ({ type, label, overriddenBy, overriddenText }) => {
      render(
        <TestContext>
          <ThemeProvider theme={theme}>
            <PluginSettingsDetailsPure
              plugin={{ ...plugin, type, isLoaded: false, overriddenBy }}
              onDelete={() => {}}
            />
          </ThemeProvider>
        </TestContext>
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText('Not Loaded')).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`"${overriddenText}" version`))).toBeInTheDocument();
    }
  );

  it('renders React element and function settingsComponent and handles Save/Cancel', async () => {
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <PluginSettingsDetailsPure
            plugin={{ ...plugin, settingsComponent: <div>Element Settings</div> }}
            onDelete={() => {}}
          />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Element Settings')).toBeInTheDocument();

    const onSave = vi.fn();
    const SettingsComp = ({ onDataChange, data }: any) => (
      <button onClick={() => onDataChange({ ...data, updated: true })}>Change Setting</button>
    );

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <PluginSettingsDetailsPure
            config={{ initial: true }}
            plugin={{
              ...plugin,
              settingsComponent: SettingsComp,
              displaySettingsComponentWithSaveButton: true,
            }}
            onSave={onSave}
            onDelete={() => {}}
          />
        </ThemeProvider>
      </TestContext>
    );

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Change Setting' }));
    expect(saveBtn).toBeEnabled();

    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ initial: true, updated: true });
      expect(mockPush).toHaveBeenCalledWith('/settings/plugins');
    });

    mockPush.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/settings/plugins');
    });
  });

  it('renders Electron folder and delete actions and confirms deletion', async () => {
    mockIsElectronRef.current = true;
    const sendSpy = vi.fn();
    (window as any).desktopApi = { send: sendSpy };
    const onDelete = vi.fn();

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <PluginSettingsDetailsPure
            plugin={{ ...plugin, folderName: 'my-plugin-folder', type: 'user' }}
            onDelete={onDelete}
          />
        </ThemeProvider>
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Plugin Folder' }));
    expect(sendSpy).toHaveBeenCalledWith('open-plugin-folder', {
      folderName: 'my-plugin-folder',
      type: 'user',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Plugin' }));
    expect(screen.getByText('Are you sure you want to delete this plugin?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onDelete).toHaveBeenCalledTimes(1);

    delete (window as any).desktopApi;
  });
});

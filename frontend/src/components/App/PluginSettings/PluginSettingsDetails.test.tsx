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
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { PluginInfo, setPluginSettings } from '../../../plugin/pluginsSlice';
import { HeadlampEventType } from '../../../redux/headlampEventSlice';
import store from '../../../redux/stores/store';
import { recordHeadlampEvents, TestContext } from '../../../test';
import PluginSettingsDetails, { PluginSettingsDetailsPure } from './PluginSettingsDetails';

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
});

describe('PluginSettingsDetails status', () => {
  function renderDetails(details: PluginInfo, others: PluginInfo[] = []) {
    store.dispatch(setPluginSettings([details, ...others]));

    render(
      <TestContext routerMap={{ name: details.name }}>
        <ThemeProvider theme={theme}>
          <PluginSettingsDetails />
        </ThemeProvider>
      </TestContext>
    );
  }

  it('shows why an enabled plugin blocked by a disabled scoped version is not loaded', () => {
    renderDetails({ ...plugin, name: 'app-catalog', isLoaded: false }, [
      {
        ...plugin,
        name: '@headlamp-k8s/app-catalog',
        type: 'shipped',
        isEnabled: false,
        isLoaded: false,
      },
    ]);

    expect(screen.getByText('Not Loaded')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This plugin is not loaded because a @headlamp-k8s version of it is installed.'
      )
    ).toBeInTheDocument();
  });

  it('gives no scoped reason for a plugin the user disabled', () => {
    renderDetails({ ...plugin, name: 'app-catalog', isEnabled: false, isLoaded: false }, [
      { ...plugin, name: '@headlamp-k8s/app-catalog', type: 'shipped' },
    ]);

    expect(screen.queryByText(/@headlamp-k8s version/)).not.toBeInTheDocument();
  });

  it('gives no scoped reason when no @headlamp-k8s version is installed', () => {
    renderDetails({ ...plugin, name: 'app-catalog', isLoaded: false });

    expect(screen.getByText('Not Loaded')).toBeInTheDocument();
    expect(screen.queryByText(/@headlamp-k8s version/)).not.toBeInTheDocument();
  });

  it('does not show a plugin the user disabled as not loaded', () => {
    renderDetails({ ...plugin, isEnabled: false, isLoaded: false });

    expect(screen.queryByText('Not Loaded')).not.toBeInTheDocument();
  });
});

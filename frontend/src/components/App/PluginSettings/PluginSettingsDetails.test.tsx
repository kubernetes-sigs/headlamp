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
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { PluginInfo, setPluginSettings } from '../../../plugin/pluginsSlice';
import { HeadlampEventType } from '../../../redux/headlampEventSlice';
import store from '../../../redux/stores/store';
import { recordHeadlampEvents, TestContext } from '../../../test';
import PluginSettingsDetails from './PluginSettingsDetails';

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

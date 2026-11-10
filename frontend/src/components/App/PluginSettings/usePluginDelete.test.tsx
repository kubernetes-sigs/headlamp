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
import { configureStore, Middleware } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import i18n from 'i18next';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { Router } from 'react-router-dom';
import translations from '../../../i18n/locales/en/translation.json';
import { deletePlugin } from '../../../lib/k8s/api/v1/pluginsApi';
import { createMuiTheme } from '../../../lib/themes';
import { PluginInfo, reloadPage } from '../../../plugin/pluginsSlice';
import {
  CLUSTER_ACTION_GRACE_PERIOD,
  executeClusterAction,
} from '../../../redux/clusterActionSlice';
import reducers from '../../../redux/reducers/reducers';
import ActionsNotifier from '../../common/ActionsNotifier';
import { PluginSettingsPure } from './PluginSettings';
import { usePluginDelete } from './usePluginDelete';

vi.mock('../../../lib/k8s/api/v1/pluginsApi', () => ({ deletePlugin: vi.fn() }));

const plugin: PluginInfo = {
  name: '@example/test-plugin',
  folderName: 'plugin-folder',
  description: 'Disposable test plugin',
  homepage: '',
  type: 'user',
  isEnabled: true,
};

async function setup() {
  const actions: { type: string }[] = [];
  const tracker: Middleware = () => next => action => {
    actions.push(action as { type: string });
    return next(action);
  };
  const store = configureStore({
    reducer: reducers,
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(tracker),
  });
  const history = createMemoryHistory({ initialEntries: ['/settings/plugins/test-plugin'] });
  await i18n.init({
    nsSeparator: '|',
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: translations } },
    interpolation: { escapeValue: false },
  });
  let deletion: Promise<void> | undefined;
  function PluginList() {
    const onDelete = usePluginDelete();
    return (
      <PluginSettingsPure
        plugins={[plugin]}
        onSave={() => {}}
        onDelete={item => {
          deletion = onDelete(item);
          return deletion;
        }}
      />
    );
  }
  const view = render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <Router history={history}>
          <ThemeProvider theme={createMuiTheme({ name: 'test', base: 'light' })}>
            <SnackbarProvider maxSnack={10} transitionDuration={0} disableWindowBlurListener>
              <ActionsNotifier />
              <PluginList />
            </SnackbarProvider>
          </ThemeProvider>
        </Router>
      </I18nextProvider>
    </Provider>
  );
  function startDeletion() {
    fireEvent.click(screen.getByRole('button', { name: 'Delete Plugin' }));
    expect(screen.queryByRole('button', { name: 'Delete Plugin' })).not.toBeInTheDocument();
    return deletion!;
  }
  function expectNoNavigationOrReload() {
    expect(history.location.pathname).toBe('/settings/plugins/test-plugin');
    expect(actions.filter(action => action.type === reloadPage.type)).toHaveLength(0);
  }
  function expectFulfilled() {
    expect(
      actions.filter(action => action.type === executeClusterAction.fulfilled.type)
    ).toHaveLength(1);
    expect(
      actions.filter(action => action.type === executeClusterAction.rejected.type)
    ).toHaveLength(0);
  }
  return {
    ...view,
    store,
    actions,
    history,
    startDeletion,
    expectNoNavigationOrReload,
    expectFulfilled,
  };
}

describe('usePluginDelete with real cluster actions and notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(deletePlugin).mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Electron');
  });
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves successful deletion and delays navigation and reload', async () => {
    vi.mocked(deletePlugin).mockResolvedValue(undefined);
    const test = await setup();
    const deletion = test.startDeletion();
    test.expectNoNavigationOrReload();
    expect(deletePlugin).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_ACTION_GRACE_PERIOD);
      await expect(deletion).resolves.toBeUndefined();
    });
    expect(deletePlugin).toHaveBeenCalledWith('plugin-folder', 'user');
    expect(screen.getByText('Deleted plugin plugin-folder.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Plugin' })).not.toBeInTheDocument();
    test.expectFulfilled();
    test.expectNoNavigationOrReload();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    test.expectNoNavigationOrReload();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(test.history.location.pathname).toBe('/settings/plugins');
    expect(test.actions.filter(action => action.type === reloadPage.type)).toHaveLength(1);
  });

  it('rejects failure, restores the row and displays the custom backend error without navigating or reloading', async () => {
    vi.mocked(deletePlugin).mockRejectedValue(new Error('Permission denied'));
    const test = await setup();
    const deletion = test.startDeletion();
    const rejection = expect(deletion).rejects.toThrow('Plugin deletion failed');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_ACTION_GRACE_PERIOD);
      await rejection;
    });
    expect(screen.getByRole('button', { name: 'Delete Plugin' })).toBeInTheDocument();
    expect(
      screen.getByText('Error deleting plugin plugin-folder: Permission denied')
    ).toBeInTheDocument();
    test.expectFulfilled();
    test.expectNoNavigationOrReload();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    test.expectNoNavigationOrReload();
  });

  it('rejects grace-period cancellation, restores the row and never runs the backend operation or navigates', async () => {
    const test = await setup();
    const deletion = test.startDeletion();
    const rejection = expect(deletion).rejects.toThrow('Plugin deletion failed');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      await rejection;
    });
    expect(screen.getByRole('button', { name: 'Delete Plugin' })).toBeInTheDocument();
    expect(screen.getByText('Cancelled deletion of plugin-folder.')).toBeInTheDocument();
    test.expectFulfilled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_ACTION_GRACE_PERIOD + 10000);
    });
    expect(deletePlugin).not.toHaveBeenCalled();
    test.expectNoNavigationOrReload();
  });

  it('clears the pending success timeout on unmount', async () => {
    vi.mocked(deletePlugin).mockResolvedValue(undefined);
    const test = await setup();
    const deletion = test.startDeletion();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_ACTION_GRACE_PERIOD);
      await deletion;
    });
    test.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    test.expectNoNavigationOrReload();
  });
});

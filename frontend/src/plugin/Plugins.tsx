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
import { SnackbarKey, useSnackbar } from 'notistack';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { isElectron } from '../helpers/isElectron';
import { useTypedSelector } from '../redux/hooks';
import { fetchAndExecutePlugins } from './index';
import { pluginsLoaded, setPluginSettings } from './pluginsSlice';
import { PLUGINS_RELOAD_EVENT } from './pluginsSlice';

/**
 * For discovering and executing plugins.
 *
 * Compared to loading plugins in script tags, doing it this way has some benefits:
 *
 * 1) We can more easily catch certain types of errors in execution. With a
 *   script tag we can not catch errors in the running scripts.
 * 2) We can load the scripts into a context other than global/window. This
 *   means that plugins do not pollute the global namespace.
 */
export default function Plugins() {
  const dispatch = useDispatch();
  const { closeSnackbar, enqueueSnackbar } = useSnackbar();
  const history = useHistory();
  const { t } = useTranslation();

  const settingsPlugins = useTypedSelector(state => state.plugins.pluginSettings);

  const settingsRef = useRef(settingsPlugins);
  useEffect(() => {
    settingsRef.current = settingsPlugins;
  }, [settingsPlugins]);

  // only run on first load
  useEffect(() => {
    let running = false;
    let pending = false;
    let disposed = false;
    const load = async (reload = false) => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      await fetchAndExecutePlugins(
        settingsRef.current,
        updatedSettingsPackages => {
          settingsRef.current = updatedSettingsPackages;
          dispatch(setPluginSettings(updatedSettingsPackages));
        },
        incompatiblePlugins => {
          const pluginList = Object.values(incompatiblePlugins)
            .map(p => p.name)
            .join(', ');
          const message = t(
            'translation|Warning. Incompatible plugins disabled: ({{ pluginList }})',
            { pluginList }
          );
          console.warn(message);

          if (isElectron()) {
            enqueueSnackbar(message, {
              action: (snackbarId: SnackbarKey) => (
                <>
                  <Button
                    color="secondary"
                    size="small"
                    onClick={() => {
                      history.push('/settings/plugins');
                      closeSnackbar(snackbarId);
                    }}
                  >
                    {t('Settings')}
                  </Button>
                </>
              ),
            });
          } else {
            enqueueSnackbar(message);
          }
        },
        reload
      )
        .catch((err: unknown) => {
          console.error('Failed to load plugins:', err);
          enqueueSnackbar(t('translation|Failed to load plugins. Please try reloading the app.'), {
            variant: 'error',
          });
        })
        .finally(() => {
          try {
            dispatch(pluginsLoaded());
            // Warn the app (if we're in app mode).
            window.desktopApi?.send('pluginsLoaded');
          } catch (err) {
            console.error('Plugin load cleanup failed:', err);
          }
        });
      running = false;
      if (pending && !disposed) {
        pending = false;
        void load(true);
      }
    };
    const reload = () => void load(true);
    window.addEventListener(PLUGINS_RELOAD_EVENT, reload);
    void load();
    return () => {
      disposed = true;
      window.removeEventListener(PLUGINS_RELOAD_EVENT, reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

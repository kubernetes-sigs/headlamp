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
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { isElectron } from '../helpers/isElectron';
import { useCluster } from '../lib/k8s';
import { useTypedSelector } from '../redux/hooks';
import { fetchAndExecutePlugins, initializePlugins } from './index';
import { pluginsLoaded, setPluginSettings } from './pluginsSlice';

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
  const cluster = useCluster();
  const settingsPlugins = useTypedSelector(state => state.plugins.pluginSettings);
  // True once fetchAndExecutePlugins (and its internal initializePlugins call) has finished.
  const [pluginsReady, setPluginsReady] = useState(false);
  // True when the first plugin load happened without a cluster in the URL.
  const loadedWithoutCluster = useRef(false);

  // only run on first load
  useEffect(() => {
    if (!cluster) {
      loadedWithoutCluster.current = true;
    }
    fetchAndExecutePlugins(
      settingsPlugins,
      updatedSettingsPackages => {
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
      }
    )
      .finally(() => {
        dispatch(pluginsLoaded());
        setPluginsReady(true);
        // Warn the app (if we're in app mode).
        window.desktopApi?.send('pluginsLoaded');
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-initialize plugins once the cluster becomes available after a no-cluster initial load.
  // Gated on pluginsReady so we never race with the fetchAndExecutePlugins call, which
  // already calls initializePlugins() internally via afterPluginsRun.
  useEffect(() => {
    if (!cluster || !pluginsReady || !loadedWithoutCluster.current) return;
    loadedWithoutCluster.current = false;
    void initializePlugins();
  }, [cluster, pluginsReady]);

  return null;
}

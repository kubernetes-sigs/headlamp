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

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { deletePlugin } from '../../../lib/k8s/api/v1/pluginsApi';
import { PluginInfo, reloadPage } from '../../../plugin/pluginsSlice';
import { clusterAction } from '../../../redux/clusterActionSlice';
import type { AppDispatch } from '../../../redux/stores/store';

/**
 * Returns a function that deletes a plugin via the backend API, dispatches
 * a clusterAction (which surfaces the start/success/error snackbars), and
 * navigates back to the plugin list before reloading.
 *
 * The returned promise resolves on success and rejects when the deletion
 * fails, so callers can roll back optimistic UI updates if needed.
 */
export function usePluginDelete() {
  const dispatch: AppDispatch = useDispatch();
  const history = useHistory();
  const { t } = useTranslation(['translation']);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (plugin: PluginInfo): Promise<void> => {
      // Use folderName when present (the actual folder name on disk),
      // otherwise fall back to extracting from the name.
      const pluginFolderName = plugin.folderName || plugin.name.split('/').splice(-1)[0];

      // Only user and development plugins can be deleted.
      const pluginType =
        plugin.type === 'development' || plugin.type === 'user' ? plugin.type : undefined;

      let deleteSucceeded = false;

      return dispatch(
        clusterAction(
          () =>
            deletePlugin(pluginFolderName, pluginType).then(() => {
              deleteSucceeded = true;
            }),
          {
            startMessage: t('Deleting plugin {{ itemName }}...', { itemName: pluginFolderName }),
            cancelledMessage: t('Cancelled deletion of {{ itemName }}.', {
              itemName: pluginFolderName,
            }),
            successMessage: t('Deleted plugin {{ itemName }}.', { itemName: pluginFolderName }),
            errorMessage: t('Error deleting plugin {{ itemName }}.', {
              itemName: pluginFolderName,
            }),
          }
        )
      ).then(() => {
        if (!deleteSucceeded) {
          // Reject so callers can roll back optimistic UI updates.
          throw new Error('Plugin deletion failed');
        }
        // Delay so the user can read the success snackbar before reload.
        deleteTimeoutRef.current = setTimeout(() => {
          history.push('/settings/plugins');
          dispatch(reloadPage());
        }, 2000);
      });
    },
    [dispatch, history, t]
  );
}

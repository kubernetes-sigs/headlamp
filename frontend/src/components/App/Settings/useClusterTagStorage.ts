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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { loadClusterSettings, storeClusterSettings } from '../../../helpers/clusterSettings';
import {
  ClusterTags,
  getClusterTagIdentity,
  getInvalidTagKeys,
  notifyClusterTagsChanged,
  storeClusterTags,
} from '../../../helpers/clusterTags';
import { isElectron } from '../../../helpers/isElectron';
import { parseKubeConfig, updateClusterTags } from '../../../lib/k8s/api/v1/clusterApi';
import type { Cluster } from '../../../lib/k8s/cluster';
import { setConfig, setStatelessConfig } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/hooks';
import store from '../../../redux/stores/store';
import { mergeStatelessConfigState } from '../../../stateless';
import { enqueueConfigOperation } from '../../../stateless/configOperationQueue';
import {
  readStatelessClusterTagTarget,
  updateStatelessClusterTags,
} from '../../../stateless/updateStatelessClusterTags';

export function useClusterTagStorage(name: string, cluster?: Cluster | null) {
  const { t } = useTranslation(['translation']);
  const dispatch = useDispatch();
  const allowKubeconfigChanges = useTypedSelector(state => state.config.allowKubeconfigChanges);
  const dynamicEnabled = useTypedSelector(state => state.config.isDynamicClusterEnabled);
  const source = cluster?.meta_data?.source;
  // Server-returned in-memory contexts have an empty origin and no persisted identity.
  const inMemoryContext =
    source === 'dynamic_cluster' &&
    !!cluster?.meta_data?.origin &&
    !cluster.meta_data.origin.kubeconfig &&
    !cluster.meta_data.clusterID;
  const contextBacked =
    dynamicEnabled &&
    ((source === 'kubeconfig' && (isElectron() || allowKubeconfigChanges)) ||
      (source === 'dynamic_cluster' && !inMemoryContext));
  const clusterID: string | undefined = cluster?.meta_data?.clusterID;
  const server: string | undefined = clusterID ? undefined : cluster?.server;
  const authType: string | undefined = clusterID ? undefined : cluster?.auth_type;
  const identity = getClusterTagIdentity(name, cluster);
  const selection = useMemo(() => ({ identity }), [identity]);
  const currentSelection = useRef(selection);
  useLayoutEffect(() => {
    currentSelection.current = selection;
  }, [selection]);
  const operation = useRef(0);
  const mounted = useRef(true);
  const [status, setStatus] = useState({ selection, saving: false, error: '' });
  const saving = status.selection === selection && status.saving;
  const error = status.selection === selection ? status.error : '';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const helpText = contextBacked
    ? t(
        'translation|Saved in the kubeconfig context and kept when renaming the cluster. Not applied to Kubernetes resources.'
      )
    : t(
        'translation|This cluster has no writable kubeconfig context. Tags are saved in this browser only, not applied to Kubernetes resources.'
      );

  async function save(tags: ClusterTags): Promise<boolean> {
    const submittedOverride = loadClusterSettings(name).tags;
    const saveOperation = ++operation.current;
    const isCurrent = () =>
      mounted.current &&
      currentSelection.current === selection &&
      operation.current === saveOperation;
    if (isCurrent()) {
      setStatus({ selection, saving: true, error: '' });
    }
    try {
      if (getInvalidTagKeys(tags).length > 0) {
        throw new Error('Invalid cluster tags');
      }
      if (!contextBacked) {
        storeClusterTags(name, tags);
      } else {
        await enqueueConfigOperation(async () => {
          if (currentSelection.current !== selection) {
            throw new Error('Cluster changed before its tags could be saved');
          }
          const updated =
            source === 'dynamic_cluster'
              ? await updateStatelessClusterTags(
                  name,
                  tags,
                  clusterID || undefined,
                  server,
                  authType
                )
              : null;
          if (updated !== null) {
            const parsed = await parseKubeConfig({ kubeconfig: updated });
            const currentConfig = await readStatelessClusterTagTarget(
              name,
              clusterID || undefined,
              server,
              authType
            );
            if (currentSelection.current !== selection || currentConfig !== updated) {
              throw new Error('Browser kubeconfig changed while saving cluster tags');
            }
            const targets = parsed?.clusters?.filter((entry: Cluster) => entry.name === name);
            if (targets?.length !== 1) {
              throw new Error('Updated kubeconfig did not contain the cluster');
            }
            dispatch(
              setStatelessConfig(
                mergeStatelessConfigState(store.getState().config.statelessClusters, {
                  clusters: targets,
                })
              )
            );
          } else {
            if (source === 'dynamic_cluster' && !clusterID) {
              throw new Error('Browser kubeconfig context no longer exists');
            }
            const config = await updateClusterTags(name, tags, clusterID);
            if (currentSelection.current !== selection) {
              throw new Error('Cluster changed while saving cluster tags');
            }
            dispatch(setConfig(config));
          }
          // The extension is authoritative after a successful write. Do not retain a stale local override.
          const settings = { ...loadClusterSettings(name) };
          if (JSON.stringify(settings.tags) === JSON.stringify(submittedOverride)) {
            delete settings.tags;
            storeClusterSettings(name, settings);
          }
          notifyClusterTagsChanged();
        });
      }
      return true;
    } catch (error) {
      if (isCurrent()) {
        setStatus({
          selection,
          saving: false,
          error: t('translation|Failed to save cluster tags: {{ error }}', {
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
      return false;
    } finally {
      if (isCurrent()) {
        setStatus(previous => ({ ...previous, saving: false }));
      }
    }
  }

  return { save, saving, error, helpText };
}

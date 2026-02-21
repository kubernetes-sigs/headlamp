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

import { useEffect, useRef } from 'react';
import { isDebugVerbose } from '../helpers/debugVerbose';
import { backendFetch } from '../lib/k8s/api/v2/fetch';

const PLUGIN_REFRESH_POLL_INTERVAL = 5000;

/**
 * Hook that periodically polls the /plugin-refresh endpoint to check for plugin changes.
 *
 * @param enabled - Whether polling should be active. Defaults to true.
 * @param pollInterval - Interval in milliseconds between polls. Defaults to 5000ms.
 */
export function usePluginRefreshCheck(
  enabled: boolean = true,
  pollInterval: number = PLUGIN_REFRESH_POLL_INTERVAL
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const checkPluginRefresh = async () => {
      try {
        await backendFetch('/plugin-refresh');
      } catch (error) {
        if (isDebugVerbose('plugin/usePluginRefreshCheck')) {
          console.debug('Plugin refresh check failed:', error);
        }
      }
    };

    intervalRef.current = setInterval(checkPluginRefresh, pollInterval);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollInterval]);
}

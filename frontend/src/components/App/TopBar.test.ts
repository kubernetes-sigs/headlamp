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

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { handleLogoutPathUpdate } from './TopBar.utils';

describe('handleLogoutPathUpdate', () => {
  let historyPush: Mock;

  beforeEach(() => {
    historyPush = vi.fn();
  });

  it('redirects to / when no cluster is specified (logout from all)', () => {
    handleLogoutPathUpdate(undefined, '/c/cluster1+cluster2/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('redirects to / when clusterToLogout is a single cluster in the path', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('removes cluster from multi-cluster path and keeps remaining', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1+cluster2/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/cluster2/pods');
  });

  it('removes cluster from middle of multi-cluster path', () => {
    handleLogoutPathUpdate('cluster2', '/c/cluster1+cluster2+cluster3/namespaces', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/cluster1+cluster3/namespaces');
  });

  it('removes last cluster from multi-cluster path and redirects to /', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1/workloads', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('redirects to / when current path has no cluster segment', () => {
    handleLogoutPathUpdate('cluster1', '/settings', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('redirects to / when current path is root', () => {
    handleLogoutPathUpdate('cluster1', '/', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('handles cluster name not found in multi-cluster path (no change, keeps all)', () => {
    handleLogoutPathUpdate('nonexistent', '/c/cluster1+cluster2/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/cluster1+cluster2/pods');
  });

  it('handles path ending with /c/clusterName (no trailing slash)', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('handles path ending with /c/clusterName/ (trailing slash)', () => {
    handleLogoutPathUpdate('cluster1', '/c/cluster1/', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/');
  });

  it('handles clusters with special characters in names', () => {
    handleLogoutPathUpdate('my-cluster', '/c/my-cluster+other-cluster/pods', historyPush);
    expect(historyPush).toHaveBeenCalledWith('/c/other-cluster/pods');
  });

  it('handles path with deeply nested routes after cluster segment', () => {
    handleLogoutPathUpdate(
      'cluster2',
      '/c/cluster1+cluster2/namespaces/default/pods/my-pod',
      historyPush
    );
    expect(historyPush).toHaveBeenCalledWith('/c/cluster1/namespaces/default/pods/my-pod');
  });
});

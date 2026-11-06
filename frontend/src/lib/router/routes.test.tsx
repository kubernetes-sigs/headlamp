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

import './index';
import React from 'react';
import { describe, expect, it } from 'vitest';
import RoleBindingList from '../../components/role/BindingList';
import ClusterRoleBinding from '../k8s/clusterRoleBinding';
import { createRouteURL } from './createRouteURL';
import { getDefaultRoutes } from './getDefaultRoutes';

describe('clusterRoleBindings route configuration', () => {
  it('configures clusterRoleBindings with an unshadowed path and RoleBindingList component', () => {
    const defaultRoutes = getDefaultRoutes();
    const clusterRoleBindings = defaultRoutes.clusterRoleBindings;
    const roleBindings = defaultRoutes.roleBindings;

    expect(clusterRoleBindings).toBeDefined();
    expect(clusterRoleBindings.path).toBe('/clusterrolebindings');
    expect(roleBindings.path).toBe('/rolebindings');
    expect(clusterRoleBindings.path).not.toBe(roleBindings.path);

    // Verify component renders RoleBindingList and not RoleBindingDetails (#7305)
    const element = (clusterRoleBindings.component as () => React.ReactElement)();
    expect(element.type).toBe(RoleBindingList);
  });

  it('generates the unshadowed URL for clusterRoleBindings and ClusterRoleBinding.listRoute', () => {
    const urlFromRouteName = createRouteURL('clusterRoleBindings', { cluster: 'my-cluster' });
    expect(urlFromRouteName).toBe('/c/my-cluster/clusterrolebindings');

    const urlFromClassListRoute = createRouteURL(ClusterRoleBinding.listRoute, {
      cluster: 'my-cluster',
    });
    expect(urlFromClassListRoute).toBe('/c/my-cluster/clusterrolebindings');
  });
});

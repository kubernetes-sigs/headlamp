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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRoute } from './getRoute';

vi.mock('./getDefaultRoutes', () => ({
  getDefaultRoutes: vi.fn(() => ({
    roles: { path: '/c/:cluster/roles', name: 'Roles' },
    roleBindings: { path: '/c/:cluster/rolebindings', name: 'RoleBindings' },
  })),
}));

describe('getRoute', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined when no name is provided', () => {
    expect(getRoute()).toBeUndefined();
  });

  it('returns a route by its exact key', () => {
    expect(getRoute('roles')).toBeDefined();
    expect(getRoute('roles')?.path).toBe('/c/:cluster/roles');
  });

  it('is case-insensitive for existing route keys', () => {
    expect(getRoute('Roles')).toBeDefined();
    expect(getRoute('ROLES')).toBeDefined();
  });

  it('returns undefined for unknown route names', () => {
    expect(getRoute('does-not-exist')).toBeUndefined();
  });

  it('resolves deprecated alias clusterRoles to roles', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const route = getRoute('clusterRoles');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/c/:cluster/roles');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"clusterRoles" is deprecated'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"roles"'));
  });

  it('resolves deprecated alias clusterRoleBindings to roleBindings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const route = getRoute('clusterRoleBindings');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/c/:cluster/rolebindings');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"clusterRoleBindings" is deprecated')
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"roleBindings"'));
  });

  it('resolves aliases case-insensitively (ClusterRoles)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const route = getRoute('ClusterRoles');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/c/:cluster/roles');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('resolves aliases case-insensitively (CLUSTERROLEBINDINGS)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const route = getRoute('CLUSTERROLEBINDINGS');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/c/:cluster/rolebindings');
    expect(warnSpy).toHaveBeenCalled();
  });
});

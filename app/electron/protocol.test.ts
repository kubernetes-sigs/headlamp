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

import { describe, expect, it } from 'vitest';
import { findProtocolUrlInArgv, getRouteFromProtocolUrl } from './protocol';

describe('getRouteFromProtocolUrl', () => {
  it('maps a resource URL to its full route', () => {
    expect(getRouteFromProtocolUrl('headlamp://c/minikube/pods/default/my-pod')).toBe(
      '/c/minikube/pods/default/my-pod'
    );
  });

  it('maps a single segment URL', () => {
    expect(getRouteFromProtocolUrl('headlamp://plugins')).toBe('/plugins');
  });

  it('keeps the query string', () => {
    expect(getRouteFromProtocolUrl('headlamp://c/minikube/deployments?namespace=kube-system')).toBe(
      '/c/minikube/deployments?namespace=kube-system'
    );
  });

  it('accepts URLs with an empty host', () => {
    expect(getRouteFromProtocolUrl('headlamp:///settings/general')).toBe('/settings/general');
  });

  it('rejects other schemes', () => {
    expect(getRouteFromProtocolUrl('https://example.com/c/minikube/pods')).toBeNull();
  });

  it('rejects unparsable URLs', () => {
    expect(getRouteFromProtocolUrl('not a url')).toBeNull();
  });

  it('rejects URLs without a route', () => {
    expect(getRouteFromProtocolUrl('headlamp://')).toBeNull();
  });

  it('rejects URLs with credentials', () => {
    expect(getRouteFromProtocolUrl('headlamp://user:pass@c/minikube/pods')).toBeNull();
  });

  it('rejects URLs with a port', () => {
    expect(getRouteFromProtocolUrl('headlamp://c:8080/minikube/pods')).toBeNull();
  });
});

describe('findProtocolUrlInArgv', () => {
  it('finds the protocol URL among other arguments', () => {
    expect(
      findProtocolUrlInArgv(['Headlamp.exe', '--allow-file-access', 'headlamp://c/test/pods'])
    ).toBe('headlamp://c/test/pods');
  });

  it('matches the scheme case-insensitively', () => {
    expect(findProtocolUrlInArgv(['HEADLAMP://plugins'])).toBe('HEADLAMP://plugins');
  });

  it('returns undefined when no protocol URL is present', () => {
    expect(findProtocolUrlInArgv(['Headlamp.exe', '--no-sandbox'])).toBeUndefined();
  });
});

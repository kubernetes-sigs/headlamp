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
import { routeTargetsListenerSet } from './utils';

const route = (namespace: string, parentRefs: any[]) => ({ metadata: { namespace }, parentRefs });
const listenerSet = (name: string, namespace: string) => ({ metadata: { name, namespace } });

describe('routeTargetsListenerSet', () => {
  it('matches a same-namespace ListenerSet when parentRef namespace is omitted', () => {
    const r = route('team-a', [{ kind: 'ListenerSet', name: 'shared' }]);
    expect(routeTargetsListenerSet(r, listenerSet('shared', 'team-a'))).toBeTruthy();
  });

  it('does not match an identically named ListenerSet in another namespace', () => {
    // An omitted parentRef namespace defaults to the route's namespace (team-a),
    // so a ListenerSet named "shared" in team-b must not be considered attached.
    const r = route('team-a', [{ kind: 'ListenerSet', name: 'shared' }]);
    expect(routeTargetsListenerSet(r, listenerSet('shared', 'team-b'))).toBeUndefined();
  });

  it('matches cross-namespace when the parentRef namespace is explicit', () => {
    const r = route('team-a', [{ kind: 'ListenerSet', name: 'shared', namespace: 'team-b' }]);
    expect(routeTargetsListenerSet(r, listenerSet('shared', 'team-b'))).toBeTruthy();
  });

  it('ignores a parentRef that targets a Gateway (the default kind)', () => {
    const r = route('team-a', [{ name: 'shared' }]);
    expect(routeTargetsListenerSet(r, listenerSet('shared', 'team-a'))).toBeUndefined();
  });
});

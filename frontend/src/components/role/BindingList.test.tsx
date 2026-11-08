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

import RoleBinding from '../../lib/k8s/roleBinding';
import { sortBindingsByKind } from './BindingList';

function makeBinding(subjects: { kind: string; name: string }[]) {
  return { subjects } as unknown as RoleBinding;
}

describe('sortBindingsByKind', () => {
  it('sorts bindings by their ServiceAccount subject names', () => {
    // Regression test for https://github.com/kubernetes-sigs/headlamp/issues/8193
    // The "Service Accounts" column used to pass the display label 'Service Accounts'
    // instead of the Kubernetes subject kind 'ServiceAccount', so the filter never
    // matched and the comparator always returned 0.
    const bravo = makeBinding([{ kind: 'ServiceAccount', name: 'bravo' }]);
    const alpha = makeBinding([{ kind: 'ServiceAccount', name: 'alpha' }]);

    const compare = sortBindingsByKind('ServiceAccount');

    expect(compare(bravo, alpha)).toBeGreaterThan(0);
    expect(compare(alpha, bravo)).toBeLessThan(0);
  });

  it('does not match subjects when given the wrong kind string', () => {
    const withServiceAccount = makeBinding([{ kind: 'ServiceAccount', name: 'bravo' }]);
    const withoutMatch = makeBinding([{ kind: 'ServiceAccount', name: 'alpha' }]);

    const compare = sortBindingsByKind('Service Accounts');

    expect(compare(withServiceAccount, withoutMatch)).toBe(0);
  });

  it('still sorts User and Group subjects correctly', () => {
    const bravo = makeBinding([{ kind: 'User', name: 'bravo' }]);
    const alpha = makeBinding([{ kind: 'User', name: 'alpha' }]);

    expect(sortBindingsByKind('User')(alpha, bravo)).toBeLessThan(0);
  });
});

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

import type { IngressRule } from './ingress';
import Ingress from './ingress';

// Keep template tests independent of UI age formatting and its resource cycle.
vi.mock('../util', () => ({ timeAgo: vi.fn() }));

describe('Ingress creation defaults', () => {
  it('defines the path type required by networking.k8s.io/v1', () => {
    const draft = Ingress.getBaseObject();
    expect(draft.apiVersion).toBe('networking.k8s.io/v1');
    expect((draft.spec.rules![0] as IngressRule).http!.paths[0].pathType).toBe('Prefix');
  });

  it('provides an absolute path for the default Prefix rule', () => {
    const draft = Ingress.getBaseObject();
    expect(draft.spec.rules![0].http!.paths[0].path).toBe('/');
    const rules = new Ingress(draft).getRules();
    expect(rules[0].http!.paths[0]).toMatchObject({ path: '/', pathType: 'Prefix' });
  });
});

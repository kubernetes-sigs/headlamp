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

import PriorityClass from './priorityClass';

// Avoid loading the UI age formatter when testing the resource model.
vi.mock('../util', () => ({ timeAgo: vi.fn() }));

describe('PriorityClass creation defaults', () => {
  it('uses the API default preemption policy instead of an invalid empty policy', () => {
    const draft = PriorityClass.getBaseObject();
    expect(draft.preemptionPolicy).toBe('PreemptLowerPriority');
    expect(draft.value).toBe(0);
    expect(draft.globalDefault).toBe(false);
  });

  it('preserves a non-preempting policy supplied by the user', () => {
    const draft = PriorityClass.getBaseObject();
    draft.preemptionPolicy = 'Never';
    const resource = new PriorityClass(draft, 'cluster');
    expect(resource.preemptionPolicy).toBe('Never');
    expect(PriorityClass.getBaseObject().preemptionPolicy).toBe('PreemptLowerPriority');
  });
});

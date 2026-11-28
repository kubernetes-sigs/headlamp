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

import StorageClass from './storageClass';

// Avoid loading the UI age formatter when testing the resource model.
vi.mock('../util', () => ({ timeAgo: vi.fn() }));

describe('StorageClass creation defaults', () => {
  it('uses the API defaults instead of an empty reclaim policy and binding mode', () => {
    const draft = StorageClass.getBaseObject();
    expect(draft.reclaimPolicy).toBe('Delete');
    expect(draft.volumeBindingMode).toBe('Immediate');
    expect(draft.provisioner).toBe('');
  });

  it('keeps the values chosen by the user', () => {
    const draft = StorageClass.getBaseObject();
    draft.reclaimPolicy = 'Retain';
    draft.volumeBindingMode = 'WaitForFirstConsumer';
    const resource = new StorageClass(draft, 'cluster');
    expect(resource.reclaimPolicy).toBe('Retain');
    expect(resource.volumeBindingMode).toBe('WaitForFirstConsumer');
    expect(StorageClass.getBaseObject().volumeBindingMode).toBe('Immediate');
  });
});

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

import { Lease } from './lease';

// The draft does not need the UI's age formatter and its resource import cycle.
vi.mock('../util', () => ({ timeAgo: vi.fn() }));

describe('Lease creation defaults', () => {
  it('leaves renewTime unset because the API cannot decode an empty time', () => {
    const draft = Lease.getBaseObject();
    expect(draft.spec).not.toHaveProperty('renewTime');
  });

  it('uses a lease duration that passes the API validation', () => {
    const draft = Lease.getBaseObject();
    expect(draft.spec).toHaveProperty('leaseDurationSeconds', 15);
    expect(draft.spec).toMatchObject({ holderIdentity: '', leaseTransitions: 0 });
  });
});

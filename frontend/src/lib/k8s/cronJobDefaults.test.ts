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

import CronJob from './cronJob';

// The draft does not need the UI's age formatter and its resource import cycle.
vi.mock('../util', () => ({ timeAgo: vi.fn() }));

describe('CronJob creation defaults', () => {
  it('uses a restart policy accepted by the embedded Job API', () => {
    const draft = CronJob.getBaseObject();
    expect(draft.spec.jobTemplate.spec.template.spec).toHaveProperty('restartPolicy', 'Never');
  });

  it('creates independent pod templates for separate drafts', () => {
    const first = CronJob.getBaseObject();
    first.spec.jobTemplate.spec.template.spec.containers[0].image = 'busybox';
    const second = CronJob.getBaseObject();
    expect(second.spec.jobTemplate.spec.template.spec.containers[0].image).toBe('');
    expect(second.spec.schedule).toBe('');
  });
});

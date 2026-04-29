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

import 'vitest-canvas-mock';
import App from '../../../App';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import Job from '../../../lib/k8s/job';
import Pod from '../../../lib/k8s/pod';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import Service from '../../../lib/k8s/service';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { isLoggableWorkload } from './isLoggableWorkload';

// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('isLoggableWorkload', () => {
  it.each([
    ['Pod', new Pod(Pod.getBaseObject())],
    ['Deployment', new Deployment(Deployment.getBaseObject())],
    ['ReplicaSet', new ReplicaSet(ReplicaSet.getBaseObject())],
    ['DaemonSet', new DaemonSet(DaemonSet.getBaseObject())],
    ['StatefulSet', new StatefulSet(StatefulSet.getBaseObject())],
    ['Job', new Job(Job.getBaseObject())],
  ])('returns true for %s', (_, item) => {
    expect(isLoggableWorkload(item)).toBe(true);
  });

  it('returns false for non-loggable workloads', () => {
    expect(isLoggableWorkload(new Service(Service.getBaseObject()))).toBe(false);
  });
});

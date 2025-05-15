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
import DaemonSet from './daemonSet';
import Deployment from './deployment';
import Job from './job';
import Pod from './pod';
import ReplicaSet from './replicaSet';
import StatefulSet from './statefulSet';

export type Workload = Pod | DaemonSet | ReplicaSet | StatefulSet | Job | CronJob | Deployment;
export type WorkloadClass =
  | typeof Pod
  | typeof DaemonSet
  | typeof ReplicaSet
  | typeof StatefulSet
  | typeof Job
  | typeof CronJob
  | typeof Deployment;

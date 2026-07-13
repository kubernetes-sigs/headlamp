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

import ConfigMap from '../../lib/k8s/configMap';
import CronJob from '../../lib/k8s/cronJob';
import Deployment from '../../lib/k8s/deployment';
import Endpoints from '../../lib/k8s/endpoints';
import EndpointSlice from '../../lib/k8s/endpointSlices';
import Ingress from '../../lib/k8s/ingress';
import Job from '../../lib/k8s/job';
import JobSet from '../../lib/k8s/jobSet';
import type { KubeObjectClass } from '../../lib/k8s/KubeObject';
import Namespace from '../../lib/k8s/namespace';
import Node from '../../lib/k8s/node';
import PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import Pod from '../../lib/k8s/pod';
import ReplicaSet from '../../lib/k8s/replicaSet';
import Service from '../../lib/k8s/service';
import ServiceAccount from '../../lib/k8s/serviceAccount';
import StatefulSet from '../../lib/k8s/statefulSet';

/**
 * Resource classes used by global search. Loaded via a single dynamic import so
 * Vite/Rollup emits one shared chunk rather than one per model module.
 */
export const searchResourceClasses: KubeObjectClass[] = [
  Pod,
  Deployment,
  Service,
  Job,
  CronJob,
  ConfigMap,
  Namespace,
  StatefulSet,
  ReplicaSet,
  PersistentVolumeClaim,
  Endpoints,
  EndpointSlice,
  Ingress,
  ServiceAccount,
  Node,
  JobSet,
];

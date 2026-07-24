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

export const BUILT_IN_RELATION_IDS = [
  'pod-configmap',
  'job-configmap',
  'pod-secret',
  'job-secret',
  'hpa-deployment',
  'hpa-statefulset',
  'vwc-service',
  'mwc-service',
  'service-pod',
  'endpoints-service',
  'endpointslices-service',
  'ingress-service',
  'ingress-secret',
  'networkpolicy-pod',
  'rolebinding-role',
  'rolebinding-sa',
  'sa-deployment',
  'sa-daemonset',
  'pvc-pod',
  'job-cronjob',
  'job-jobset',
  'gateway-gatewayclass',
  'httproute-gateway',
  'httproute-service',
  'backendtlspolicy-service',
  'backendtrafficpolicy-service',
];

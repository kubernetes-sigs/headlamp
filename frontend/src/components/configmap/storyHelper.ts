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

import { KubeConfigMap } from '../../lib/k8s/configMap';

const binaryData = {
  'hello.txt': 'SGVsbG8sIFdvcmxkIQo=',
  'config.bin': 'YmluYXJ5AGNvbmZpZwFwYXlsb2Fk',
};

const data = {
  storageClassName: 'default',
  volumeMode: 'Filesystem',
  volumeName: 'pvc-abc-1234',
};

const metadata = {
  creationTimestamp: '2023-04-27T20:31:27Z',
  namespace: 'default',
  name: 'my-pvc',
  resourceVersion: '1234',
  uid: 'abc-1234',
};

export const BASE_EMPTY_CONFIG_MAP: KubeConfigMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata,
};

export const BASE_DATA_CONFIG_MAP: KubeConfigMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata,
  data,
};

export const BASE_BINARY_DATA_CONFIG_MAP: KubeConfigMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata,
  binaryData,
};

export const BASE_BINARY_DATA_AND_DATA_CONFIG_MAP: KubeConfigMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata,
  data,
  binaryData,
};

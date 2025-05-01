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

import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface KubeRoleBinding extends KubeObjectInterface {
  roleRef: {
    apiGroup: string;
    kind: string;
    name: string;
  };
  subjects: {
    apiGroup: string;
    kind: string;
    name: string;
    namespace: string;
  }[];
}

class RoleBinding extends KubeObject<KubeRoleBinding> {
  static kind = 'RoleBinding';
  static apiName = 'rolebindings';
  static apiVersion = 'rbac.authorization.k8s.io/v1';
  static isNamespaced = true;

  get roleRef() {
    return this.jsonData.roleRef;
  }

  get subjects(): KubeRoleBinding['subjects'] {
    return this.jsonData.subjects;
  }
}

export default RoleBinding;

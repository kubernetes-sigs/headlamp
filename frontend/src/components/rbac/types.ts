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

import { KubeRole } from '../../lib/k8s/role';
import { KubeRoleBinding } from '../../lib/k8s/roleBinding';

export type RbacSubjectKind = 'ServiceAccount' | 'User' | 'Group';

export interface RbacSubject {
  kind: RbacSubjectKind;
  name: string;
  namespace?: string;
  apiGroup?: string;
}

export interface SubjectNodeData extends Record<string, unknown> {
  subject: RbacSubject;
}

export interface BindingNodeData extends Record<string, unknown> {
  binding: KubeRoleBinding;
  isClusterRoleBinding: boolean;
  name: string;
  namespace?: string;
  roleRefName: string;
  roleRefKind: string;
}

export interface RoleNodeData extends Record<string, unknown> {
  role?: KubeRole;
  name: string;
  namespace?: string;
  isClusterRole: boolean;
  rulesCount: number;
}

export interface RuleNodeData extends Record<string, unknown> {
  ruleIndex: number;
  apiGroups: string[];
  resources: string[];
  verbs: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
  roleName: string;
}

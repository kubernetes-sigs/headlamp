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

import React from 'react';
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import ReplicaSet, { KubeReplicaSet } from '../../lib/k8s/replicaSet';
import SchemaResourceForm from '../common/Resource/SchemaResourceForm';

/** Draft (in-progress) ReplicaSet edited by the form. */
export type ReplicaSetDraft = RecursivePartial<KubeReplicaSet>;

/** Props for {@link ReplicaSetForm}. Shared `{ resource, onChange }` contract
 *  used by all create-resource forms so YAML editor state stays in sync. */
export interface ReplicaSetFormProps {
  resource?: ReplicaSetDraft;
  onChange: (resource: ReplicaSetDraft) => void;
}

/** ReplicaSet creation form. Thin wrapper around {@link SchemaResourceForm}
 *  which derives the visible fields from the cluster's OpenAPI schema for
 *  `apps/v1 ReplicaSet`. New resource types only need to pass their own
 *  `kubeObjectClass` to get an equivalent form. */
export default function ReplicaSetForm(props: ReplicaSetFormProps) {
  const { resource, onChange } = props;

  return (
    <SchemaResourceForm
      kubeObjectClass={ReplicaSet}
      resource={resource as Record<string, any> | undefined}
      onChange={onChange as (resource: Record<string, any>) => void}
    />
  );
}

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

import type { ApiResource } from './api/v2/ApiResource';
import { makeCustomResourceClass } from './crd';
import type { GenericResourceRef } from './genericResourceRef';
import type { KubeObjectClass } from './KubeObject';

function splitApiVersion(apiVersion: string): [string, string] {
  if (!apiVersion.includes('/')) {
    return ['', apiVersion];
  }
  const i = apiVersion.indexOf('/');
  return [apiVersion.slice(0, i), apiVersion.slice(i + 1)];
}

/** Dynamic KubeObject class for any discovered API resource (core, extension, CRD). */
export function kubeClassFromGenericResourceRef(ref: GenericResourceRef): KubeObjectClass {
  const [group, version] = splitApiVersion(ref.apiVersion);
  return makeCustomResourceClass({
    apiInfo: [{ group, version }],
    kind: ref.kind,
    pluralName: ref.pluralName,
    singularName: ref.singularName || ref.pluralName,
    isNamespaced: ref.isNamespaced,
  });
}

export function kubeClassFromApiResource(resource: ApiResource): KubeObjectClass {
  return kubeClassFromGenericResourceRef({
    apiVersion: resource.apiVersion,
    pluralName: resource.pluralName,
    kind: resource.kind,
    isNamespaced: resource.isNamespaced,
    singularName: resource.singularName,
    groupName: resource.groupName,
  });
}

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
import type { KubeObject } from './KubeObject';

/** Stable reference for generic list/detail routes (URL-safe). */
export interface GenericResourceRef {
  apiVersion: string;
  pluralName: string;
  kind: string;
  isNamespaced: boolean;
  singularName?: string;
  groupName?: string;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Reject oversized path segments (URL / proxy limits, abuse). */
const MAX_REF_PARAM_LENGTH = 8192;

export function serializeGenericResourceRef(ref: GenericResourceRef): string {
  const json = JSON.stringify(ref);
  if (json.length > 4096) {
    throw new Error('GenericResourceRef JSON exceeds maximum length');
  }
  return toBase64Url(json);
}

export function parseGenericResourceRef(id: string): GenericResourceRef | null {
  if (!id || id.length > MAX_REF_PARAM_LENGTH) {
    return null;
  }
  try {
    const json = fromBase64Url(id);
    const obj = JSON.parse(json) as GenericResourceRef;
    if (
      typeof obj?.apiVersion !== 'string' ||
      typeof obj?.pluralName !== 'string' ||
      typeof obj?.kind !== 'string' ||
      typeof obj?.isNamespaced !== 'boolean'
    ) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

export function genericResourceRefFromApiResource(resource: ApiResource): GenericResourceRef {
  return {
    apiVersion: resource.apiVersion,
    pluralName: resource.pluralName,
    kind: resource.kind,
    isNamespaced: resource.isNamespaced,
    singularName: resource.singularName,
    groupName: resource.groupName,
  };
}

export function genericResourceRefFromKubeObject(item: KubeObject): GenericResourceRef {
  const cls = item._class();
  return {
    apiVersion: item.jsonData.apiVersion,
    pluralName: cls.apiName,
    kind: item.kind,
    isNamespaced: cls.isNamespaced,
    groupName: cls.apiGroupName,
  };
}

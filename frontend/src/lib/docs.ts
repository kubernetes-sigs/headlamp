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

/*
 * This module was taken from the k8dash project.
 */

import Swagger from '@apidevtools/swagger-parser';
import { OpenAPIV2 } from 'openapi-types';
import { request } from './k8s/apiProxy';

let docsPromise: ReturnType<typeof getDocs> | null = null;

async function getDocs() {
  const docs = await request('/openapi/v2');
  return Swagger.dereference(docs);
}

export function resetDocsPromise() {
  docsPromise = null;
}

export default async function getDocDefinitions(apiVersion: string, kind: string) {
  if (!docsPromise) {
    docsPromise = getDocs(); // Don't wait here. Just kick off the request
  }

  try {
    const { definitions = {} } = (await docsPromise) as OpenAPIV2.Document;

    let [group, version] = apiVersion.split('/');
    if (!version) {
      version = group;
      group = '';
    }

    return Object.values(definitions)
      .filter(x => !!x['x-kubernetes-group-version-kind'])
      .find(x => x['x-kubernetes-group-version-kind'].some(comparer));

    function comparer(info: OpenAPIV2.SchemaObject) {
      return info.group === group && info.version === version && info.kind === kind;
    }
  } catch (error) {
    // Reset docsPromise on error so subsequent requests can try again
    resetDocsPromise();
    throw error;
  }
}

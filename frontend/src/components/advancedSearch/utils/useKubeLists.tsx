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

import { useEffect, useMemo, useState } from 'react';
import { ResourceClasses } from '../../../lib/k8s';
import { ApiResource } from '../../../lib/k8s/api/v2/ApiResource';
import { ApiError } from '../../../lib/k8s/apiProxy';
import { KubeObject, KubeObjectClass } from '../../../lib/k8s/cluster';
import { useNamespaces } from '../../../redux/filterSlice';

/**
 * A hook that fetches and returns a list of Kubernetes objects for the specified resources.
 *
 * @param resources - An array of ApiResource objects specifying the kinds of resources to fetch.
 * @param clusters - An array of cluster names from which to fetch the resources.
 * @param maxItems - Maximum amount of items per resource.
 * @param refetchIntervalMs - How often to refresh resources. In milliseconds.
 * @returns An array of Kubernetes objects from the specified resources and clusters.
 */
export const useKubeLists = (
  resources: ApiResource[],
  clusters: string[],
  maxItems: number,
  refetchIntervalMs: number
) => {
  const namespaces = useNamespaces();
  const classes = useMemo(
    () =>
      resources
        .map(
          it =>
            (ResourceClasses as Record<string, KubeObjectClass>)[it.kind] ??
            class extends KubeObject {
              static kind = it.kind;
              static apiVersion = it.apiVersion;
              static apiName = it.pluralName;
              static isNamespaced = it.isNamespaced;
            }
        )
        .filter(Boolean) as KubeObjectClass[],
    [resources]
  );

  const data = classes.map(it =>
    it.useList({ clusters, refetchInterval: refetchIntervalMs, namespace: namespaces })
  );

  const [items, setItems] = useState<any[]>([]);
  const isLoading = data.some(it => !it.items && !it.isError);

  useEffect(() => {
    if (isLoading) return;

    const newItems = data.flatMap(it => {
      if (it.items && it.items.length < maxItems) {
        return it.items;
      } else {
        // The amount of items exceeds the limit
        return [];
      }
    });

    setItems(oldItems => (equal(oldItems, newItems) ? oldItems : newItems));
  }, [data, classes, isLoading]);

  const errors = useMemo(() => {
    return data
      .map((it, index) => {
        const resource = resources[index];

        if (it.errors && it.errors.length === 1 && it.errors[0].status === 404) {
          return;
        }

        if (it.errors?.length) {
          return { resource, errors: it.errors };
        }
      })
      .filter(Boolean) as { resource: ApiResource; errors: ApiError[] }[];
  }, [data, resources]);

  return { items, errors, isLoading };
};

const equal = (arr1: any[], arr2: any[]) => {
  if (arr1.length !== arr2.length) return false;

  return arr1.every((it, i) => it === arr2[i]);
};

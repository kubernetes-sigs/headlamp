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

import type { KubeObjectInterface } from '../../KubeObject';
import { KubeObject } from '../../KubeObject';

export interface KubeList<T extends KubeObjectInterface> {
  kind: string;
  apiVersion: string;
  items: T[];
  metadata: {
    resourceVersion: string;
  };
}

export interface KubeListUpdateEvent<T extends KubeObjectInterface> {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';
  object: T;
}

export const KubeList = {
  /**
   * Apply an update event to the existing list
   *
   * @param list - List of kubernetes resources
   * @param update - Update event to apply to the list
   * @param itemClass - Class of an item in the list. Used to instantiate each item
   * @returns New list with the updated values
   */
  applyUpdate<
    ObjectInterface extends KubeObjectInterface,
    ObjectClass extends typeof KubeObject<ObjectInterface>
  >(
    list: KubeList<KubeObject<ObjectInterface>>,
    update: KubeListUpdateEvent<ObjectInterface>,
    itemClass: ObjectClass,
    cluster: string
  ): KubeList<KubeObject<ObjectInterface>> {
    // Skip a duplicate event that carries the same resourceVersion we already
    // have. resourceVersion is an opaque string in the Kubernetes API and must
    // not be compared numerically: large values lose precision past
    // Number.MAX_SAFE_INTEGER, and non-numeric versions parse to NaN. Watch
    // events arrive in order, so an equality check is enough here.
    if (
      list.metadata.resourceVersion &&
      update.object.metadata.resourceVersion &&
      update.object.metadata.resourceVersion === list.metadata.resourceVersion
    ) {
      return list;
    }

    const newItems = [...list.items];
    const index = newItems.findIndex(item => item.metadata.uid === update.object.metadata.uid);

    switch (update.type) {
      case 'ADDED':
      case 'MODIFIED':
        if (index !== -1) {
          newItems[index] = new itemClass(update.object, cluster);
        } else {
          newItems.push(new itemClass(update.object, cluster));
        }
        break;
      case 'DELETED':
        if (index !== -1) {
          newItems.splice(index, 1);
        }
        break;
      case 'ERROR':
        console.error('Error in update', update);
        break;
      default:
        console.error('Unknown update type', update);
    }

    return {
      ...list,
      metadata: {
        resourceVersion: update.object.metadata.resourceVersion!,
      },
      items: newItems,
    };
  },
};

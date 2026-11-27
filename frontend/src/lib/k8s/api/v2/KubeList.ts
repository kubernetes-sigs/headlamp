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
    /** Continuation token — present when more results exist beyond this page. */
    continue?: string;
    /** Approximate count of remaining items beyond this page. */
    remainingItemCount?: number;
  };
}

export type KubeListUpdateEvent<T extends KubeObjectInterface> =
  | { type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR'; object: T }
  | { type: 'BOOKMARK'; object: { metadata: { resourceVersion: string } } };

/** Reports whether both resourceVersions are decimal and the first is older. */
export function isResourceVersionOlder(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return BigInt(a) < BigInt(b);
  }
  return false;
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
    const resourceVersion = update.object.metadata.resourceVersion;
    const currentVersion = list.metadata.resourceVersion;
    // Shared watches can replay earlier decimal versions when a subscriber catches up.
    if (
      resourceVersion &&
      (resourceVersion === currentVersion ||
        isResourceVersionOlder(resourceVersion, currentVersion))
    ) {
      return list;
    }

    const metadata = { ...list.metadata, resourceVersion: resourceVersion! };
    if (update.type === 'BOOKMARK') {
      return { ...list, metadata };
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
      metadata,
      items: newItems,
    };
  },
};

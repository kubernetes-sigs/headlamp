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

import { Icon } from '@iconify/react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { Activity } from '../../activity/Activity';
import ActionButton, { ButtonStyle } from '../ActionButton';
import { fetchLatestKubeObject } from './fetchLatestKubeObject';
import ResourceComparison from './ResourceComparison';

/**
 * Whether the given items can be compared: exactly two objects of the same kind and apiVersion.
 * They may belong to different namespaces or clusters.
 */
export function canCompareResources(items: KubeObject[]): boolean {
  if (items.length !== 2) {
    return false;
  }
  const [first, second] = items;
  return (
    !!first.kind &&
    first.kind === second.kind &&
    first.jsonData?.apiVersion === second.jsonData?.apiVersion
  );
}

/** Describes an object by its cluster, namespace and name, e.g. "prod / default / web". */
export function getComparisonLabel(item: KubeObject): string {
  return [item.cluster, item.metadata.namespace, item.metadata.name].filter(Boolean).join(' / ');
}

/** Returns the latest version of the item, or the item itself if it could not be fetched. */
async function fetchLatestOrCurrent(item: KubeObject): Promise<KubeObject> {
  try {
    return await fetchLatestKubeObject(item);
  } catch (err) {
    console.error(
      'Error while fetching latest resource for comparison:',
      {
        kind: item.kind,
        name: item.metadata.name,
        namespace: item.metadata.namespace,
        cluster: item.cluster,
      },
      err
    );
    return item;
  }
}

export interface CompareMultipleButtonProps {
  /** The two items to compare. */
  items: KubeObject[];
  buttonStyle?: ButtonStyle;
}

/**
 * Opens a read-only side-by-side diff of two selected objects of the same kind in an Activity.
 */
export default function CompareMultipleButton({ items, buttonStyle }: CompareMultipleButtonProps) {
  const { t } = useTranslation(['translation']);
  const launchRequestRef = useRef(0);

  const launchComparison = useCallback(async () => {
    if (!canCompareResources(items)) {
      return;
    }
    const requestId = ++launchRequestRef.current;
    const [first, second] = await Promise.all(items.map(fetchLatestOrCurrent));
    if (requestId !== launchRequestRef.current) {
      return;
    }

    const activityId = `compare-${first.metadata.uid}-${second.metadata.uid}`;
    Activity.close(activityId);
    Activity.launch({
      id: activityId,
      // Comparing the same object across clusters or namespaces is the usual case, so only name
      // it once when both names match.
      title:
        first.metadata.name === second.metadata.name
          ? t('translation|Compare {{name}}', { name: first.metadata.name })
          : t('translation|Compare {{first}} and {{second}}', {
              first: first.metadata.name,
              second: second.metadata.name,
            }),
      cluster: first.cluster === second.cluster ? first.cluster : undefined,
      icon: <Icon icon="mdi:compare-horizontal" />,
      location: 'full',
      content: (
        <ResourceComparison
          original={first.jsonData}
          modified={second.jsonData}
          originalLabel={getComparisonLabel(first)}
          modifiedLabel={getComparisonLabel(second)}
        />
      ),
    });
  }, [items, t]);

  return (
    <ActionButton
      description={t('translation|Compare items')}
      buttonStyle={buttonStyle}
      onClick={launchComparison}
      icon="mdi:compare-horizontal"
    />
  );
}

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

import { useMemo } from 'react';
import { request } from './api/v1/clusterRequests';
import type { QueryParameters } from './api/v1/queryParameters';
import type { ApiError } from './api/v2/ApiError';
import { ResourceClasses } from './index';
import { KubeMetadata } from './KubeMetadata';
import type { KubeObjectClass } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeEventV2 {
  type: string;
  reason: string;
  note: string;
  metadata: KubeMetadata;
  regarding: {
    kind: string;
    namespace: string;
    name: string;
    uid: string;
    apiVersion: string;
    resourceVersion: string;
    fieldPath: string;
  };
  eventTime: string;
  [otherProps: string]: any;
}

class EventV2 extends KubeObject<KubeEventV2> {
  static kind = 'Event';
  static apiName = 'events';
  static apiVersion = 'events.k8s.io/v1';

  static isNamespaced = true;

  static useListForClusters = useEventV2ListForClusters;
  static useWarningList = useEventV2WarningList;

  // Max number of events to fetch from the API
  private static maxEventsLimit = 2000;

  // Getter to get the max number of events that are to be fetched
  static get maxLimit() {
    return this.maxEventsLimit;
  }

  // Setter to set the max number of events that are to be fetched
  static set maxLimit(limit: number) {
    this.maxEventsLimit = limit;
  }

  get spec() {
    return this.getValue('spec');
  }

  get status() {
    return this.getValue('status');
  }

  get regarding() {
    return this.getValue('regarding');
  }

  /**
   * @deprecated Use 'regarding' instead.
   */
  get involvedObject() {
    return this.regarding;
  }

  get type() {
    return this.getValue('type');
  }

  get reason() {
    return this.getValue('reason');
  }

  get message() {
    return this.getValue('note');
  }

  get source(): { component?: string; host?: string } | undefined {
    const deprecatedSource = this.getValue('deprecatedSource') as
      | { component?: string; host?: string }
      | undefined;
    if (deprecatedSource?.component) {
      return deprecatedSource;
    }
    const reportingController = this.getValue('reportingController');
    if (reportingController) {
      return { component: reportingController };
    }
    return deprecatedSource;
  }

  get count() {
    const series = this.getValue('series');
    if (!!series) {
      return series.count;
    }

    return this.getValue('count');
  }

  get lastOccurrence() {
    const series = this.getValue('series');
    if (!!series) {
      return series.lastObservedTime;
    }

    const deprecatedLastTimestamp = this.getValue('deprecatedLastTimestamp');
    if (!!deprecatedLastTimestamp) {
      return deprecatedLastTimestamp;
    }

    const eventTime = this.getValue('eventTime');
    if (!!eventTime) {
      return eventTime;
    }

    const deprecatedFirstTimestamp = this.getValue('deprecatedFirstTimestamp');
    if (!!deprecatedFirstTimestamp) {
      return deprecatedFirstTimestamp;
    }

    const creationTimestamp = this.metadata.creationTimestamp;
    return creationTimestamp;
  }

  get firstOccurrence() {
    const eventTime = this.getValue('eventTime');
    if (!!eventTime) {
      return eventTime;
    }

    const deprecatedFirstTimestamp = this.getValue('deprecatedFirstTimestamp');
    if (!!deprecatedFirstTimestamp) {
      return deprecatedFirstTimestamp;
    }

    const creationTimestamp = this.metadata.creationTimestamp;
    return creationTimestamp;
  }

  static async objectEvents(object: KubeObject) {
    const namespace = object.metadata.namespace;
    const name = object.metadata.name;
    const objectKind = object.kind;
    const cluster = object.cluster;

    let path = '/apis/events.k8s.io/v1/events';
    const fieldSelector: { [key: string]: string } = {
      'regarding.kind': objectKind,
      'regarding.name': name,
    };

    if (namespace) {
      path = `/apis/events.k8s.io/v1/namespaces/${namespace}/events`;
      fieldSelector['regarding.namespace'] = namespace;
    }

    const queryParams = {
      fieldSelector: Object.keys(fieldSelector)
        .map(function (k) {
          return `${k}=${fieldSelector[k]}`;
        })
        .join(','),
      limit: this.maxLimit,
    };

    const response = await request(path, { cluster }, true, true, queryParams);

    return response.items;
  }

  get involvedObjectInstance(): KubeObject | null {
    if (!this.regarding) {
      return null;
    }

    const InvolvedObjectClass = (ResourceClasses as Record<string, KubeObjectClass>)[
      this.regarding.kind
    ];
    let objInstance: KubeObject | null = null;
    if (!!InvolvedObjectClass) {
      objInstance = new InvolvedObjectClass(
        {
          kind: this.regarding.kind,
          metadata: {
            name: this.regarding.name,
            namespace: InvolvedObjectClass.isNamespaced
              ? this.regarding.namespace ?? this.getNamespace()
              : undefined,
          } as KubeMetadata,
        },
        this.cluster
      );
    }

    return objInstance;
  }
}

export default EventV2;

/**
 * Fetch events for given clusters
 *
 * Important! Make sure to have the parent component have clusters as a key
 * so that component remounts when clusters change, instead of rerendering
 * with different number of clusters
 */
export function useEventV2ListForClusters(
  clusterNames: string[],
  options: { queryParams?: QueryParameters } = {}
) {
  const queries = EventV2.useList({
    clusters: clusterNames,
    ...options.queryParams,
  });

  type EventsPerCluster = {
    [cluster: string]: {
      warnings: EventV2[];
      error?: ApiError | null;
    };
  };

  const result = useMemo(() => {
    const res: EventsPerCluster = {};

    queries.errors?.forEach(error => {
      if (error.cluster) {
        res[error.cluster] ??= { warnings: [] };
        res[error.cluster].error = error;
      }
    });

    Object.entries(queries.clusterResults ?? {}).forEach(([cluster, result]) => {
      if (!res[cluster]) {
        res[cluster] = { warnings: [] };
      }

      res[cluster].warnings = result.items ?? [];
    });

    return res;
  }, [queries.clusterResults, queries.errors]);

  return result;
}

/**
 * Fetch warning events for given clusters
 * Amount is limited to {@link EventV2.maxLimit}
 *
 * Important! Make sure to have the parent component have clusters as a key
 * so that component remounts when clusters change, instead of rerendering
 * with different number of clusters
 */
export function useEventV2WarningList(
  clusters: string[],
  options?: { queryParams?: QueryParameters }
) {
  const queryParameters = Object.assign(
    {
      limit: EventV2.maxLimit,
      fieldSelector: 'type!=Normal',
    },
    options?.queryParams ?? {}
  );

  const warningsList = useEventV2ListForClusters(clusters, { queryParams: queryParameters });

  return warningsList;
}

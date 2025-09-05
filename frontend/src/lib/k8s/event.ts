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

import _ from 'lodash';
import React, { useMemo } from 'react';
import { ResourceClasses } from '.';
import { request } from './api/v1/clusterRequests';
import { QueryParameters } from './api/v1/queryParameters';
import { ApiError } from './api/v2/ApiError';
import { KubeMetadata } from './KubeMetadata';
import { KubeObject } from './KubeObject';
import { KubeObjectClass } from './KubeObject';

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  metadata: KubeMetadata;
  involvedObject: {
    kind: string;
    namespace: string;
    name: string;
    uid: string;
    apiVersion: string;
    resourceVersion: string;
    fieldPath: string;
  };
  [otherProps: string]: any;
}

class Event extends KubeObject<KubeEvent> {
  static kind = 'Event';
  static apiName = 'events';
  static apiVersion = 'v1';

  static isNamespaced = true;

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

  get involvedObject() {
    return this.getValue('involvedObject');
  }

  get type() {
    return this.getValue('type');
  }

  get reason() {
    return this.getValue('reason');
  }

  get message() {
    return this.getValue('message');
  }

  get source() {
    return this.getValue('source');
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

    const lastTimestamp = this.getValue('lastTimestamp');
    if (!!lastTimestamp) {
      return lastTimestamp;
    }

    const eventTime = this.getValue('eventTime');
    if (!!eventTime) {
      return eventTime;
    }

    const firstTimestamp = this.getValue('firstTimestamp');
    if (!!firstTimestamp) {
      return firstTimestamp;
    }

    const creationTimestamp = this.metadata.creationTimestamp;
    return creationTimestamp;
  }

  get firstOccurrence() {
    const eventTime = this.getValue('eventTime');
    if (!!eventTime) {
      return eventTime;
    }

    const firstTimestamp = this.getValue('firstTimestamp');
    if (!!firstTimestamp) {
      return firstTimestamp;
    }

    const creationTimestamp = this.metadata.creationTimestamp;
    return creationTimestamp;
  }

  static async objectEvents(object: KubeObject) {
    const namespace = object.metadata.namespace;
    const name = object.metadata.name;
    const objectKind = object.kind;
    const cluster = object.cluster;

    let path = '/api/v1/events';
    const fieldSelector: { [key: string]: string } = {
      'involvedObject.kind': objectKind,
      'involvedObject.name': name,
    };

    if (namespace) {
      path = `/api/v1/namespaces/${namespace}/events`;
      fieldSelector['involvedObject.namespace'] = namespace;
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
    if (!this.involvedObject) {
      return null;
    }

    const InvolvedObjectClass = (ResourceClasses as Record<string, KubeObjectClass>)[
      this.involvedObject.kind
    ];
    let objInstance: KubeObject | null = null;
    if (!!InvolvedObjectClass) {
      objInstance = new InvolvedObjectClass(
        {
          kind: this.involvedObject.kind,
          metadata: {
            name: this.involvedObject.name,
            namespace: InvolvedObjectClass.isNamespaced
              ? this.involvedObject.namespace ?? this.getNamespace()
              : undefined,
          } as KubeMetadata,
        },
        this.cluster
      );
    }

    return objInstance;
  }

  /**
   * Fetch events for given clusters
   *
   * Important! Make sure to have the parent component have clusters as a key
   * so that component remounts when clusters change, instead of rerendering
   * with different number of clusters
   */
  static useListForClusters(
    clusterNames: string[],
    options: { queryParams?: QueryParameters } = {}
  ) {
    // Calling hooks in a loop is usually forbidden
    // But if we make sure that clusters don't change between renders it's fine
    const queries = Event.useList({
      clusters: clusterNames,
      ...options.queryParams,
    });

    type EventsPerCluster = {
      [cluster: string]: {
        warnings: Event[];
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
    }, [queries, clusterNames]);

    return result;
  }

  /**
   * Fetch warning events for given clusters
   * Amount is limited to {@link Event.maxEventsLimit}
   *
   * Important! Make sure to have the parent component have clusters as a key
   * so that component remounts when clusters change, instead of rerendering
   * with different number of clusters
   */
  static useWarningList(clusters: string[], options?: { queryParams?: QueryParameters }) {
    const queryParameters = Object.assign(
      {
        limit: this.maxEventsLimit,
        fieldSelector: 'type!=Normal',
      },
      options?.queryParams ?? {}
    );

    const newWarningsList = this.useListForClusters(clusters, { queryParams: queryParameters });
    const [warningList, setWarningList] = React.useState<typeof newWarningsList>(newWarningsList);

    // Only update the warnings if they actually differ
    React.useEffect(() => {
      if (_.isEqual(warningList, newWarningsList)) {
        return;
      }

      setWarningList(newWarningsList);
    }, [newWarningsList]);

    return warningList;
  }
}

export default Event;

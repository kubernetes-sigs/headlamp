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

import type { CustomViewWidgetDefinition } from '../../redux/customViewsSlice';

export const BUILTIN_WIDGET_TYPES = {
  RESOURCE_DETAILS: 'headlamp.resource-details',
  RESOURCE_LOGS: 'headlamp.resource-logs',
  RESOURCE_EVENTS: 'headlamp.resource-events',
  CLUSTER_METRICS: 'headlamp.cluster-metrics',
  RESOURCE_LIST: 'headlamp.resource-list',
} as const;

export const LOGGABLE_RESOURCE_KINDS = [
  'CronJob',
  'DaemonSet',
  'Deployment',
  'Job',
  'Pod',
  'ReplicaSet',
  'StatefulSet',
] as const;

/**
 * Lightweight metadata for Headlamp's built-in widget types. Kept free of heavy
 * resource/UI imports so header actions (e.g. AddToViewButton) never introduce
 * circular dependencies or pull ResourceClasses into unrelated unit tests.
 */
export const BUILTIN_VIEW_WIDGET_METADATA: Omit<
  CustomViewWidgetDefinition<any>,
  'component' | 'configComponent'
>[] = [
  {
    type: BUILTIN_WIDGET_TYPES.RESOURCE_DETAILS,
    label: 'Resource Summary',
    description: 'Live status, metadata, and quick link for a Kubernetes resource',
    icon: 'mdi:text-box-outline',
    defaultColSpan: 6,
    supportsResource: () => true,
    createConfigFromResource: ({ resource, cluster }) => ({
      title: `${resource.kind}: ${resource.getName()}`,
      config: {
        kind: resource.kind,
        name: resource.getName(),
        namespace: resource.getNamespace() || '',
        cluster: resource.cluster || cluster || '',
      },
    }),
  },
  {
    type: BUILTIN_WIDGET_TYPES.RESOURCE_LOGS,
    label: 'Resource Logs',
    description: 'Live streaming container logs for a Pod or workload',
    icon: 'mdi:file-document-box-outline',
    defaultColSpan: 12,
    supportsResource: resource =>
      ['Pod', 'Deployment', 'ReplicaSet', 'DaemonSet', 'StatefulSet', 'Job'].includes(
        resource.kind
      ),
    createConfigFromResource: ({ resource, cluster }) => ({
      title: `Logs: ${resource.getName()}`,
      config: {
        kind: resource.kind,
        name: resource.getName(),
        namespace: resource.getNamespace() || '',
        cluster: resource.cluster || cluster || '',
      },
    }),
  },
  {
    type: BUILTIN_WIDGET_TYPES.RESOURCE_EVENTS,
    label: 'Events',
    description: 'Live Kubernetes events filtered by resource or namespace',
    icon: 'mdi:calendar',
    defaultColSpan: 6,
    supportsResource: () => true,
    createConfigFromResource: ({ resource, cluster }) => ({
      title: `Events: ${resource.getName()}`,
      config: {
        kind: resource.kind,
        name: resource.getName(),
        namespace: resource.getNamespace() || '',
        cluster: resource.cluster || cluster || '',
      },
    }),
  },
  {
    type: BUILTIN_WIDGET_TYPES.CLUSTER_METRICS,
    label: 'Cluster Metrics',
    description: 'CPU, Memory, Pods, and Nodes utilization charts (including chart plugins)',
    icon: 'mdi:chart-timeline-variant',
    defaultColSpan: 6,
    supportsResource: resource => resource.kind === 'Node',
    createConfigFromResource: ({ resource, cluster }) => ({
      title: `Metrics (${resource.cluster || cluster || 'Cluster'})`,
      config: {
        cluster: resource.cluster || cluster || '',
        metric: 'all',
      },
    }),
  },
  {
    type: BUILTIN_WIDGET_TYPES.RESOURCE_LIST,
    label: 'Resource List',
    description: 'Compact live table of Kubernetes resources by kind, namespace, and labels',
    icon: 'mdi:format-list-bulleted',
    defaultColSpan: 6,
  },
];

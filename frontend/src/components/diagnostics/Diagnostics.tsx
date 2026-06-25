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

import Alert, { AlertColor } from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import type { KubeCondition, KubeContainerStatus } from '../../lib/k8s/cluster';
import type Event from '../../lib/k8s/event';
import type { KubeEvent } from '../../lib/k8s/event';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import Pod from '../../lib/k8s/pod';
import type { Workload } from '../../lib/k8s/Workload';
import { localeDate, timeAgo } from '../../lib/util';
import Empty from '../common/EmptyContent';
import Link from '../common/Link';
import Loader from '../common/Loader';
import { useObjectEvents } from '../common/ObjectEventList';
import SectionBox from '../common/SectionBox';

/** Union of the Event class and raw KubeEvent object, used so helpers work with both shapes. */
type EventLike = Event | KubeEvent;
/** Alias for Pod, kept as an indirection so helpers are not tightly coupled to the class. */
type PodLike = Pod;
/** A translation function compatible with i18next's `t()`. */
type Translate = (key: string, options?: Record<string, string | number | undefined>) => string;

/** A navigable reference attached to a diagnostic item (e.g. a link to pod logs or details). */
export interface DiagnosticReference {
  /** Human-readable text shown for this reference. */
  label: string;
  /** Headlamp route name to link to (e.g. 'Pod'). */
  routeName?: string;
  /** Route parameters such as resource name and namespace. */
  params?: {
    /** Name of the target resource. */
    name?: string;
    /** Namespace of the target resource. */
    namespace?: string;
  };
  /** Query-string parameters appended to the link (e.g. `{ view: 'logs' }`). */
  search?: Record<string, string>;
  /** Cluster to activate when following this reference. */
  activeCluster?: string;
  /** A KubeObject to link to directly via its built-in route. */
  kubeObject?: KubeObject;
}

/** A single diagnostic finding rendered as an MUI Alert. */
export interface DiagnosticItem {
  /** Stable identifier used for deduplication and as the React key. */
  id: string;
  /** MUI Alert severity that controls the color: 'error', 'warning', or 'info'. */
  severity: AlertColor;
  /** Short headline shown in the alert title. */
  title: string;
  /** Optional longer explanation shown below the title. */
  message?: string;
  /** Optional metadata chips displayed beneath the message. */
  details?: string[];
  /** Optional navigable links (e.g. to logs or related resources). */
  references?: DiagnosticReference[];
}

/** Returns true if the value is defined, non-null, and non-empty when coerced to a string. */
function hasText(value?: string | number | null) {
  return value !== undefined && value !== null && `${value}` !== '';
}

/**
 * Fallback translation that interpolates `{{ key }}` placeholders without i18next.
 * Used in unit tests and when no translation context is available.
 */
function defaultTranslate(key: string, options: Record<string, string | number | undefined> = {}) {
  return key.replace(/{{\s*(\w+)\s*}}/g, (_, name) => `${options[name] ?? ''}`);
}

/**
 * Maps a container failure reason and/or exit code to an MUI Alert severity.
 * Critical failures (non-zero exits, CrashLoopBackOff, OOMKilled, etc.) return 'error';
 * all other abnormal states return 'warning'.
 */
function containerSeverity(reason?: string, exitCode?: number): AlertColor {
  if (exitCode !== undefined && exitCode !== 0) {
    return 'error';
  }

  if (
    reason &&
    /crash|error|failed|backoff|errimagepull|imagepull|oomkilled|createcontainerconfigerror/i.test(
      reason
    )
  ) {
    return 'error';
  }

  return 'warning';
}

/** Returns the occurrence count for an event, falling back to 1 if unavailable. */
function getEventCount(event: EventLike) {
  const series = (event as KubeEvent).series;
  const count = (event as Event).count ?? series?.count ?? (event as KubeEvent).count;
  return typeof count === 'number' && count > 0 ? count : 1;
}

/** Returns the most recent timestamp for an event, trying several fields in priority order. */
function getEventLastOccurrence(event: EventLike) {
  return (
    (event as Event).lastOccurrence ||
    (event as KubeEvent).series?.lastObservedTime ||
    (event as KubeEvent).lastTimestamp ||
    (event as KubeEvent).eventTime ||
    (event as KubeEvent).firstTimestamp ||
    (event as KubeEvent).metadata?.creationTimestamp ||
    ''
  );
}

/** Returns the earliest timestamp for an event, trying several fields in priority order. */
function getEventFirstOccurrence(event: EventLike) {
  return (
    (event as Event).firstOccurrence ||
    (event as KubeEvent).eventTime ||
    (event as KubeEvent).firstTimestamp ||
    (event as KubeEvent).metadata?.creationTimestamp ||
    ''
  );
}

/** Returns true if the event is a Warning type or has a failure-related reason. */
function isWarningEvent(event: EventLike) {
  const eventType = (event as Event).type ?? (event as KubeEvent).type;
  const reason = (event as Event).reason ?? (event as KubeEvent).reason ?? '';

  return (
    eventType === 'Warning' ||
    (eventType !== 'Normal' &&
      /failed|backoff|unhealthy|unschedulable|error|exceeded|forbidden|invalid/i.test(reason))
  );
}

/** Filters warning events and sorts them by last occurrence (newest first), then by count. */
function sortWarningEvents(events: EventLike[]) {
  return [...events].filter(isWarningEvent).sort((eventA, eventB) => {
    const dateA = new Date(getEventLastOccurrence(eventA)).getTime() || 0;
    const dateB = new Date(getEventLastOccurrence(eventB)).getTime() || 0;

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return getEventCount(eventB) - getEventCount(eventA);
  });
}

/** Creates a reference that links to the log viewer for a given pod. */
function podLogReference(pod: PodLike, label = defaultTranslate('View logs')): DiagnosticReference {
  return {
    label,
    routeName: 'Pod',
    params: {
      namespace: pod.metadata.namespace,
      name: pod.metadata.name,
    },
    search: { view: 'logs' },
    activeCluster: pod.cluster,
  };
}

/** Creates a reference that links to the detail page of a given pod. */
function podReference(pod: PodLike): DiagnosticReference {
  return {
    label: pod.metadata.name,
    kubeObject: pod,
  };
}

/**
 * Returns conditions whose status is 'False' or 'Unknown'.
 * Conditions are skipped entirely when the pod phase is 'Succeeded'.
 */
function getFailedConditions(conditions: KubeCondition[] = [], phase?: string) {
  if (phase === 'Succeeded') {
    return [];
  }

  return conditions.filter(condition => ['False', 'Unknown'].includes(condition.status));
}

/**
 * Returns a summary of the pod's status including reason, message, ready/total
 * container counts, and cumulative restarts. Delegates to `pod.getDetailedStatus()`
 * when available, otherwise computes the values from raw status fields.
 */
function getDetailedPodStatus(pod: PodLike) {
  if (typeof pod.getDetailedStatus === 'function') {
    return pod.getDetailedStatus();
  }

  return {
    reason: pod.status?.reason || pod.status?.phase || 'Unknown',
    message: pod.status?.message || '',
    readyContainers: 0,
    totalContainers: pod.status?.containerStatuses?.length || pod.spec?.containers?.length || 0,
    restarts:
      pod.status?.containerStatuses?.reduce((sum, status) => sum + status.restartCount, 0) || 0,
  };
}

/**
 * Returns true when a pod is considered healthy: either it has Succeeded,
 * or it is Running with its Ready condition True and no abnormal reason.
 */
function isPodHealthy(pod: PodLike) {
  if (pod.status?.phase === 'Succeeded') {
    return true;
  }

  const readyCondition = pod.status?.conditions?.find(condition => condition.type === 'Ready');
  const details = getDetailedPodStatus(pod);

  return (
    pod.status?.phase === 'Running' &&
    readyCondition?.status === 'True' &&
    details.reason === 'Running'
  );
}

/** Groups container statuses by type (init, regular, ephemeral) with translated labels. */
function getContainerStatusGroups(pod: PodLike, t: Translate = defaultTranslate) {
  return [
    {
      idLabel: 'Init container',
      label: t('Init container'),
      statuses: pod.status?.initContainerStatuses || [],
    },
    {
      idLabel: 'Container',
      label: t('Container'),
      statuses: pod.status?.containerStatuses || [],
    },
    {
      idLabel: 'Ephemeral container',
      label: t('Ephemeral container'),
      statuses: pod.status?.ephemeralContainerStatuses || [],
    },
  ];
}

/** Builds metadata chip strings (restart count, exit code, signal, finish time) for a container. */
function containerDetails(status: KubeContainerStatus, t: Translate) {
  const details: string[] = [];
  const terminated = status.state?.terminated || status.lastState?.terminated;

  if (hasText(status.restartCount)) {
    details.push(t('Restart count: {{ restartCount }}', { restartCount: status.restartCount }));
  }
  if (terminated && hasText(terminated.exitCode)) {
    details.push(t('Exit code: {{ exitCode }}', { exitCode: terminated.exitCode }));
  }
  if (terminated && hasText(terminated.signal)) {
    details.push(t('Signal: {{ signal }}', { signal: terminated.signal }));
  }
  if (terminated?.finishedAt) {
    details.push(t('Finished: {{ date }}', { date: localeDate(terminated.finishedAt) }));
  }

  return details;
}

/** Produces diagnostics for waiting, terminated, and restarted containers in a pod. */
function getContainerDiagnostics(pod: PodLike, t: Translate): DiagnosticItem[] {
  const diagnostics: DiagnosticItem[] = [];

  for (const group of getContainerStatusGroups(pod, t)) {
    for (const status of group.statuses) {
      const waiting = status.state?.waiting;
      const terminated = status.state?.terminated;
      const lastTerminated = status.lastState?.terminated;

      if (waiting) {
        diagnostics.push({
          id: `container-waiting-${group.idLabel}-${status.name}`,
          severity: containerSeverity(waiting.reason),
          title: t('{{ containerType }} {{ containerName }} is waiting: {{ reason }}', {
            containerType: group.label,
            containerName: status.name,
            reason: waiting.reason || t('Waiting'),
          }),
          message: waiting.message,
          details: containerDetails(status, t),
          references: [podLogReference(pod, t('View logs'))],
        });
      }

      if (terminated && terminated.exitCode !== 0) {
        const reason =
          terminated.reason || t('Exit code: {{ exitCode }}', { exitCode: terminated.exitCode });
        diagnostics.push({
          id: `container-terminated-${group.idLabel}-${status.name}`,
          severity: containerSeverity(terminated.reason, terminated.exitCode),
          title: t('{{ containerType }} {{ containerName }} terminated: {{ reason }}', {
            containerType: group.label,
            containerName: status.name,
            reason,
          }),
          message: terminated.message,
          details: containerDetails(status, t),
          references: [podLogReference(pod, t('View logs'))],
        });
      }

      if (status.restartCount > 0 && lastTerminated) {
        const title =
          status.restartCount === 1
            ? t('{{ containerType }} {{ containerName }} restarted {{ restartCount }} time', {
                containerType: group.label,
                containerName: status.name,
                restartCount: status.restartCount,
              })
            : t('{{ containerType }} {{ containerName }} restarted {{ restartCount }} times', {
                containerType: group.label,
                containerName: status.name,
                restartCount: status.restartCount,
              });
        diagnostics.push({
          id: `container-restarted-${group.idLabel}-${status.name}`,
          severity: containerSeverity(lastTerminated.reason, lastTerminated.exitCode),
          title,
          message: lastTerminated.message,
          details: containerDetails(status, t),
          references: [podLogReference(pod, t('View current or previous logs'))],
        });
      }
    }
  }

  return diagnostics;
}

/** Emits an informational diagnostic when any containers have been restarted, hinting that previous logs may be available. */
function getPreviousLogsDiagnostics(pod: PodLike, t: Translate): DiagnosticItem[] {
  const restartedContainers = getContainerStatusGroups(pod, t).flatMap(group =>
    group.statuses
      .filter(status => status.restartCount > 0)
      .map(status => `${status.name} (${status.restartCount})`)
  );

  if (restartedContainers.length === 0) {
    return [];
  }

  return [
    {
      id: 'pod-previous-logs',
      severity: 'info',
      title: t('Previous logs may be available for restarted containers'),
      details: restartedContainers.map(container => t('Container: {{ container }}', { container })),
      references: [podLogReference(pod, t('Open logs'))],
    },
  ];
}

/** Returns informational diagnostics for pods stuck in Pending (scheduling issues, node selectors, affinity, PVCs). */
function getPendingHints(pod: PodLike, warningEvents: EventLike[], t: Translate): DiagnosticItem[] {
  if (pod.status?.phase !== 'Pending') {
    return [];
  }

  const diagnostics: DiagnosticItem[] = [];
  const scheduledCondition = pod.status?.conditions?.find(
    condition => condition.type === 'PodScheduled'
  );
  const failedSchedulingEvent = warningEvents.find(event =>
    /FailedScheduling|Unschedulable/i.test((event as Event).reason ?? (event as KubeEvent).reason)
  );

  if (scheduledCondition && scheduledCondition.status !== 'True') {
    diagnostics.push({
      id: 'pod-scheduling-condition',
      severity: 'warning',
      title: t('Pod scheduling is blocked: {{ reason }}', {
        reason: scheduledCondition.reason || scheduledCondition.status,
      }),
      message: scheduledCondition.message,
    });
  } else if (failedSchedulingEvent) {
    const reason =
      (failedSchedulingEvent as Event).reason || (failedSchedulingEvent as KubeEvent).reason;
    diagnostics.push({
      id: 'pod-scheduling-event',
      severity: 'warning',
      title: t('Pod scheduling event: {{ reason }}', { reason }),
      message:
        (failedSchedulingEvent as Event).message || (failedSchedulingEvent as KubeEvent).message,
    });
  }

  if (pod.spec?.nodeSelector && Object.keys(pod.spec.nodeSelector).length > 0) {
    diagnostics.push({
      id: 'pod-node-selector',
      severity: 'info',
      title: t('Pod has node selector constraints'),
      details: Object.entries(pod.spec.nodeSelector).map(([key, value]) => `${key}: ${value}`),
    });
  }

  const affinity = (pod.spec as any)?.affinity;
  if (affinity) {
    diagnostics.push({
      id: 'pod-affinity',
      severity: 'info',
      title: t('Pod has affinity or anti-affinity constraints'),
    });
  }

  const pvcNames = (pod.spec?.volumes || [])
    .map(volume => volume.persistentVolumeClaim?.claimName)
    .filter(Boolean);
  if (pvcNames.length > 0) {
    diagnostics.push({
      id: 'pod-pvc-hint',
      severity: 'info',
      title: t('Pod depends on persistent volume claims'),
      details: pvcNames.map(name => t('PVC: {{ name }}', { name })),
    });
  }

  return diagnostics;
}

/** Converts the top 5 warning events into diagnostic items sorted by recency and count. */
function eventDiagnostics(events: EventLike[], t: Translate): DiagnosticItem[] {
  return sortWarningEvents(events)
    .slice(0, 5)
    .map(event => {
      const reason = (event as Event).reason ?? (event as KubeEvent).reason ?? 'Warning';
      const count = getEventCount(event);
      const lastOccurrence = getEventLastOccurrence(event);
      const firstOccurrence = getEventFirstOccurrence(event);
      const details = [
        lastOccurrence
          ? t('Last seen: {{ age }} ({{ date }})', {
              age: timeAgo(lastOccurrence),
              date: localeDate(lastOccurrence),
            })
          : '',
        count > 1 && firstOccurrence
          ? t('{{ eventCount }} times since {{ age }}', {
              eventCount: count,
              age: timeAgo(firstOccurrence),
            })
          : count > 1
          ? t('{{ eventCount }} times', { eventCount: count })
          : '',
      ].filter(Boolean);

      return {
        id: `event-${(event as Event).metadata?.uid || reason}`,
        severity: containerSeverity(reason),
        title:
          count > 1
            ? t('Warning event: {{ reason }} ({{ eventCount }} times)', {
                reason,
                eventCount: count,
              })
            : t('Warning event: {{ reason }}', { reason }),
        message: (event as Event).message ?? (event as KubeEvent).message,
        details,
      };
    });
}

/**
 * Aggregates all diagnostic findings for a single pod: overall status, failed conditions,
 * container issues, restart hints, pending scheduling hints, and warning events.
 * Returns a deduplicated list of {@link DiagnosticItem} entries.
 */
export function getPodDiagnostics(
  pod: PodLike,
  events: EventLike[] = [],
  t: Translate = defaultTranslate
): DiagnosticItem[] {
  const diagnostics: DiagnosticItem[] = [];
  const details = getDetailedPodStatus(pod);
  const podHealthy = isPodHealthy(pod);
  const warningEvents = sortWarningEvents(events);

  if (!podHealthy) {
    diagnostics.push({
      id: 'pod-status',
      severity: containerSeverity(details.reason, pod.status?.phase === 'Failed' ? 1 : undefined),
      title: t('Pod status: {{ status }}', {
        status: details.reason || pod.status?.phase || t('Unknown'),
      }),
      message: details.message || pod.status?.message,
      details: [
        t('Phase: {{ phase }}', { phase: pod.status?.phase || t('Unknown') }),
        details.totalContainers
          ? t('Ready containers: {{ ready }}/{{ total }}', {
              ready: details.readyContainers,
              total: details.totalContainers,
            })
          : '',
        details.restarts ? t('Total restarts: {{ restarts }}', { restarts: details.restarts }) : '',
      ].filter(Boolean),
    });
  }

  for (const condition of getFailedConditions(pod.status?.conditions, pod.status?.phase)) {
    diagnostics.push({
      id: `condition-${condition.type}`,
      severity: condition.status === 'Unknown' ? 'warning' : 'error',
      title: t('Condition {{ type }} is {{ status }}', {
        type: condition.type,
        status: condition.status,
      }),
      message: condition.message,
      details: [
        condition.reason ? t('Reason: {{ reason }}', { reason: condition.reason }) : '',
      ].filter(Boolean),
    });
  }

  diagnostics.push(...getContainerDiagnostics(pod, t));
  diagnostics.push(...getPreviousLogsDiagnostics(pod, t));
  diagnostics.push(...getPendingHints(pod, warningEvents, t));
  diagnostics.push(...eventDiagnostics(events, t));

  return dedupeDiagnostics(diagnostics);
}

/**
 * Determines the single most significant failure reason for a pod.
 * Checks scheduling, waiting containers, terminated containers, and Ready condition in order.
 */
function getPodDominantReason(pod: PodLike) {
  const scheduledCondition = pod.status?.conditions?.find(
    condition => condition.type === 'PodScheduled'
  );

  if (scheduledCondition?.status !== undefined && scheduledCondition.status !== 'True') {
    return 'Unschedulable';
  }

  for (const group of getContainerStatusGroups(pod)) {
    for (const status of group.statuses) {
      if (status.state?.waiting?.reason) {
        return status.state.waiting.reason;
      }
      if (status.state?.terminated?.reason && status.state.terminated.exitCode !== 0) {
        return status.state.terminated.reason;
      }
      if (status.lastState?.terminated?.reason && status.restartCount > 0) {
        return status.lastState.terminated.reason;
      }
    }
  }

  const readyCondition = pod.status?.conditions?.find(condition => condition.type === 'Ready');
  if (readyCondition?.status && readyCondition.status !== 'True') {
    return readyCondition.reason || 'NotReady';
  }

  const details = getDetailedPodStatus(pod);
  return details.reason || pod.status?.phase || 'Unknown';
}

/** Returns true when a pod is not healthy (inverse of {@link isPodHealthy}). */
function isUnhealthyPod(pod: PodLike) {
  return !isPodHealthy(pod);
}

/** Emits a warning diagnostic when a workload has unavailable, missing, or unready replicas. */
function workloadReplicaDiagnostics(workload: Workload, t: Translate): DiagnosticItem[] {
  const desiredReplicas = workload.spec?.replicas;
  const status = workload.status || {};
  const unavailableReplicas = status.unavailableReplicas;
  const availableReplicas = status.availableReplicas;
  const readyReplicas = status.readyReplicas;

  if (desiredReplicas === undefined) {
    return [];
  }

  const hasUnavailable =
    (unavailableReplicas !== undefined && unavailableReplicas > 0) ||
    (availableReplicas !== undefined && availableReplicas < desiredReplicas) ||
    (readyReplicas !== undefined && readyReplicas < desiredReplicas);

  if (!hasUnavailable) {
    return [];
  }

  return [
    {
      id: 'workload-replicas-unavailable',
      severity: 'warning',
      title: t('{{ kind }} has unavailable replicas', { kind: workload.kind }),
      details: [
        t('Desired: {{ replicas }}', { replicas: desiredReplicas }),
        availableReplicas !== undefined
          ? t('Available: {{ replicas }}', { replicas: availableReplicas })
          : '',
        readyReplicas !== undefined ? t('Ready: {{ replicas }}', { replicas: readyReplicas }) : '',
        unavailableReplicas !== undefined
          ? t('Unavailable: {{ replicas }}', { replicas: unavailableReplicas })
          : '',
      ].filter(Boolean),
    },
  ];
}

/**
 * Aggregates diagnostics for a workload: replica availability, failed conditions,
 * and owned pods grouped by their dominant failure reason.
 * Returns a deduplicated list of {@link DiagnosticItem} entries.
 */
export function getWorkloadDiagnostics(
  workload: Workload,
  pods: PodLike[] = [],
  t: Translate = defaultTranslate
) {
  const diagnostics: DiagnosticItem[] = [];
  const unhealthyPods = pods.filter(isUnhealthyPod);
  const reasons = new Map<string, PodLike[]>();

  diagnostics.push(...workloadReplicaDiagnostics(workload, t));

  for (const condition of getFailedConditions(workload.status?.conditions || [])) {
    diagnostics.push({
      id: `workload-condition-${condition.type}`,
      severity: condition.status === 'Unknown' ? 'warning' : 'error',
      title: t('{{ kind }} condition {{ type }} is {{ status }}', {
        kind: workload.kind,
        type: condition.type,
        status: condition.status,
      }),
      message: condition.message,
      details: [
        condition.reason ? t('Reason: {{ reason }}', { reason: condition.reason }) : '',
      ].filter(Boolean),
    });
  }

  for (const pod of unhealthyPods) {
    const reason = getPodDominantReason(pod);
    const podsForReason = reasons.get(reason);
    if (podsForReason) {
      podsForReason.push(pod);
    } else {
      reasons.set(reason, [pod]);
    }
  }

  for (const [reason, podsForReason] of [...reasons.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )) {
    const count = podsForReason.length;
    let title: string;
    if (reason === 'Unschedulable') {
      title =
        count === 1
          ? t('{{ podCount }} pod is unschedulable', { podCount: count })
          : t('{{ podCount }} pods are unschedulable', { podCount: count });
    } else {
      title =
        count === 1
          ? t('{{ podCount }} pod is failing with {{ reason }}', {
              podCount: count,
              reason,
            })
          : t('{{ podCount }} pods are failing with {{ reason }}', {
              podCount: count,
              reason,
            });
    }

    diagnostics.push({
      id: `workload-pods-${reason}`,
      severity: containerSeverity(reason),
      title,
      details: [
        t('Unhealthy owned pods: {{ unhealthy }}/{{ total }}', {
          unhealthy: count,
          total: pods.length,
        }),
      ],
      references: podsForReason.slice(0, 5).map(podReference),
    });
  }

  return dedupeDiagnostics(diagnostics);
}

/** Removes duplicate diagnostic items by their id, keeping the first occurrence. */
function dedupeDiagnostics(items: DiagnosticItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

/** Renders a DiagnosticReference as a navigable Link or plain text fragment. */
function renderReference(reference: DiagnosticReference, index: number) {
  if (reference.kubeObject) {
    return (
      <Link key={index} kubeObject={reference.kubeObject}>
        {reference.label}
      </Link>
    );
  }

  if (reference.routeName) {
    return (
      <Link
        key={index}
        routeName={reference.routeName}
        params={reference.params}
        search={reference.search}
        activeCluster={reference.activeCluster}
      >
        {reference.label}
      </Link>
    );
  }

  return <React.Fragment key={index}>{reference.label}</React.Fragment>;
}

/** Renders a list of diagnostic items as MUI Alerts, or an empty-state message when there are none. */
function DiagnosticsList(props: { items: DiagnosticItem[] }) {
  const { items } = props;
  const { t } = useTranslation('translation');

  if (items.length === 0) {
    return <Empty>{t('No active diagnostics found for this resource.')}</Empty>;
  }

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {items.map(item => (
        <Alert severity={item.severity} variant="outlined" key={item.id}>
          <AlertTitle>{item.title}</AlertTitle>
          {item.message && <Typography>{item.message}</Typography>}
          {item.details && item.details.length > 0 && (
            <Box display="flex" gap={0.75} flexWrap="wrap" mt={1}>
              {item.details.map((detail, index) => (
                <Chip key={index} size="small" label={detail} />
              ))}
            </Box>
          )}
          {item.references && item.references.length > 0 && (
            <Box display="flex" gap={1} flexWrap="wrap" mt={1}>
              {item.references.map(renderReference)}
            </Box>
          )}
        </Alert>
      ))}
    </Box>
  );
}

/**
 * Section component that displays diagnostics for a single pod.
 * Fetches events automatically unless pre-fetched events are provided.
 */
export function PodDiagnosticsSection(props: { pod: Pod; events?: Event[] }) {
  const { pod, events } = props;
  const { t } = useTranslation('translation');
  const fetchedEvents = useObjectEvents(events === undefined ? pod : null);
  const diagnosticEvents = events ?? fetchedEvents;
  const diagnostics = React.useMemo(
    () => getPodDiagnostics(pod, diagnosticEvents, t),
    [pod, diagnosticEvents, t]
  );

  return (
    <SectionBox title={t('Diagnostics')}>
      <DiagnosticsList items={diagnostics} />
    </SectionBox>
  );
}

/**
 * Section component that displays diagnostics for a workload and its owned pods.
 * Shows a loading spinner while pods are being fetched, and reports pod-fetch errors
 * as a warning diagnostic.
 */
export function WorkloadDiagnosticsSection(props: {
  /** The parent workload resource (Deployment, StatefulSet, etc.). */
  workload: Workload;
  /** Owned pods, or null while still loading. */
  pods?: Pod[] | null;
  /** Errors from the pod fetch, if any. */
  errors?: ApiError[] | null;
}) {
  const { workload, pods, errors } = props;
  const { t } = useTranslation('translation');
  const podsLoading = pods === null && !errors?.length;

  const diagnostics = React.useMemo(() => {
    if (podsLoading) {
      return [];
    }
    const items = getWorkloadDiagnostics(workload, pods || [], t);
    if (errors?.length) {
      items.push({
        id: 'workload-owned-pods-error',
        severity: 'warning',
        title: t('Unable to load owned pods for diagnostics'),
        details: errors.map(error => error.message || `${error}`),
      });
    }
    return items;
  }, [workload, pods, errors, podsLoading, t]);

  return (
    <SectionBox title={t('Diagnostics')}>
      {podsLoading ? (
        <Loader title={t('Loading diagnostics')} />
      ) : (
        <DiagnosticsList items={diagnostics} />
      )}
    </SectionBox>
  );
}

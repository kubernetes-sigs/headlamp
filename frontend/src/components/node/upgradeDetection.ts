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
import Event from '../../lib/k8s/event';
import type Node from '../../lib/k8s/node';

/**
 * Event-matching constants for AKS node upgrade detection.
 * These message substrings come from AKS and are used to identify upgrade stages from Kubernetes events.
 * AKS has tests to guarantee these messages remain consistent.
 * If there is a need to change an event or add more events, first change the AKS RP code;
 * after the release rollout, update these constants and the event processing logic accordingly.
 */
export const EVENT_REASONS = {
  UPGRADE: 'Upgrade',
  SURGE: 'Surge',
  CORDON: 'Cordon',
  DRAIN: 'Drain',
} as const;

export const EVENT_REASON_VALUES = new Set<string>(Object.values(EVENT_REASONS));

export const EVENT_MESSAGES = {
  UPGRADE_STARTED: 'Upgrade started for agent pool',
  SURGE_CREATED: 'Created a surge node',
  CORDONING: 'Cordoning node',
  DRAINING: 'Draining node',
  DELETING_NODE: 'Deleting node',
  DELETING_FROM_API: 'from API server',
  REIMAGING: 'Reimaging node',
  SUCCESSFULLY_REIMAGED: 'Successfully reimaged node',
  SUCCESSFULLY_UPGRADED: 'Successfully upgraded node',
  DRAINING_ERROR: 'Error draining node',
  UNABLE_TO_DELETE: 'Unable to delete node',
  FAILED_TO_REIMAGE: 'Failed to reimage node',
} as const;

/**
 * Check if any node in the list is an AKS-managed node.
 * Detection uses multiple signals:
 * - providerID starting with "azure://"
 * - "kubernetes.azure.com/cluster" label
 */
export function hasAKSManagedNodes(nodes: Node[]): boolean {
  return nodes.some(node => {
    // Check providerID for Azure provider
    const providerID = node.jsonData?.spec?.providerID || '';
    if (providerID.startsWith('azure://')) {
      return true;
    }

    // Check for AKS-specific label
    const labels = node.metadata.labels || {};
    if ('kubernetes.azure.com/cluster' in labels) {
      return true;
    }

    return false;
  });
}

/**
 * Hook that fetches upgrade-related events via two targeted API calls
 * (reason=Upgrade and reason=Surge) and merges the results.
 * Shared by StatusCharts and UpgradeVisualizationPanel.
 */
export function useIsUpgradeDetected(): boolean {
  const { items: upgradeReasonEvents } = Event.useList({
    limit: 500,
    fieldSelector: 'reason=Upgrade',
  });

  const { items: surgeReasonEvents } = Event.useList({
    limit: 500,
    fieldSelector: 'reason=Surge',
  });

  return useMemo(() => {
    const events = [...(upgradeReasonEvents || []), ...(surgeReasonEvents || [])];
    if (events.length === 0) return false;
    return isUpgradeDetected(events);
  }, [upgradeReasonEvents, surgeReasonEvents]);
}

/**
 * Determine if an upgrade is happening by checking for upgrade start, surge or reimage events.
 */
export function isUpgradeDetected(events: Event[]): boolean {
  return events.some(event => {
    const reason = event.reason;
    const message = event.message || '';
    if (reason === EVENT_REASONS.UPGRADE && message.includes(EVENT_MESSAGES.UPGRADE_STARTED)) {
      return true;
    }
    if (reason === EVENT_REASONS.SURGE && message.includes(EVENT_MESSAGES.SURGE_CREATED)) {
      return true;
    }
    if (
      reason === EVENT_REASONS.UPGRADE &&
      message.includes(EVENT_MESSAGES.SUCCESSFULLY_REIMAGED)
    ) {
      return true;
    }
    return false;
  });
}

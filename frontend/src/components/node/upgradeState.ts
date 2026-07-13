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

import type Event from '../../lib/k8s/event';
import type Node from '../../lib/k8s/node';
import { EVENT_MESSAGES, EVENT_REASONS } from './upgradeDetection';

/**
 * The 5 stages of a regular node upgrade, in order.
 */
export const UPGRADE_STAGES = ['cordon', 'drain', 'deleteNode', 'reimage', 'completed'] as const;
export type UpgradeStage = (typeof UPGRADE_STAGES)[number];

export interface NodeUpgradeState {
  nodeName: string;
  isSurge: boolean;
  isUpgrading: boolean;
  currentStage: UpgradeStage | null;
  failedStage: UpgradeStage | null;
  failureMessage: string | null;
  /** Timestamp (ISO string) when each stage started */
  stageTimestamps: Partial<Record<UpgradeStage, string>>;
}

/**
 * Build upgrade state for each node by processing events.
 */
export function buildNodeUpgradeStates(
  nodes: Node[],
  events: Event[]
): Map<string, NodeUpgradeState> {
  const stateMap = new Map<string, NodeUpgradeState>();

  // Initialize all nodes
  for (const node of nodes) {
    const name = node.metadata.name;
    if (!name) continue;
    stateMap.set(name, {
      nodeName: name,
      isSurge: false,
      isUpgrading: false,
      currentStage: null,
      failedStage: null,
      failureMessage: null,
      stageTimestamps: {},
    });
  }

  // Sort events by first occurrence (oldest first).
  // Use event.firstOccurrence and fall back to raw creationTimestamp because
  // Kubernetes Events that use series/update-in-place can have misleading creationTimestamps.
  const sortedEvents = [...events]
    .filter(e => e.involvedObject?.kind === 'Node')
    .sort((a, b) => {
      const timeA = new Date(a.firstOccurrence || a.metadata?.creationTimestamp || 0).getTime();
      const timeB = new Date(b.firstOccurrence || b.metadata?.creationTimestamp || 0).getTime();
      return timeA - timeB;
    });

  for (const event of sortedEvents) {
    const nodeName = event.involvedObject?.name;
    if (!nodeName) continue;

    // Ensure node exists in state map (could be an event for a node not yet in node list)
    if (!stateMap.has(nodeName)) {
      stateMap.set(nodeName, {
        nodeName,
        isSurge: false,
        isUpgrading: false,
        currentStage: null,
        failedStage: null,
        failureMessage: null,
        stageTimestamps: {},
      });
    }

    const state = stateMap.get(nodeName)!;
    const reason = event.reason || '';
    const message = event.message || '';
    const eventType = event.type || 'Normal';
    const eventTime = event.firstOccurrence || event.metadata?.creationTimestamp || '';

    // Once completed, state is immutable
    if (state.currentStage === 'completed') {
      continue;
    }

    // Check for surge node
    if (reason === EVENT_REASONS.SURGE && message.includes(EVENT_MESSAGES.SURGE_CREATED)) {
      state.isSurge = true;
      continue;
    }

    // Process regular upgrade stages
    if (reason === EVENT_REASONS.CORDON && message.includes(EVENT_MESSAGES.CORDONING)) {
      state.isUpgrading = true;
      state.currentStage = 'cordon';
      if (!state.stageTimestamps.cordon && eventTime) {
        state.stageTimestamps.cordon = eventTime;
      }
      continue;
    }

    if (reason === EVENT_REASONS.DRAIN && message.includes(EVENT_MESSAGES.DRAINING)) {
      state.isUpgrading = true;
      state.currentStage = 'drain';
      if (!state.stageTimestamps.drain && eventTime) {
        state.stageTimestamps.drain = eventTime;
      }
      continue;
    }

    if (
      reason === EVENT_REASONS.UPGRADE &&
      message.includes(EVENT_MESSAGES.DELETING_NODE) &&
      message.includes(EVENT_MESSAGES.DELETING_FROM_API)
    ) {
      state.isUpgrading = true;
      state.currentStage = 'deleteNode';
      if (!state.stageTimestamps.deleteNode && eventTime) {
        state.stageTimestamps.deleteNode = eventTime;
      }
      continue;
    }

    if (reason === EVENT_REASONS.UPGRADE && message.includes(EVENT_MESSAGES.REIMAGING)) {
      state.isUpgrading = true;
      state.currentStage = 'reimage';
      if (!state.stageTimestamps.reimage && eventTime) {
        state.stageTimestamps.reimage = eventTime;
      }
      continue;
    }

    if (
      reason === EVENT_REASONS.UPGRADE &&
      message.includes(EVENT_MESSAGES.SUCCESSFULLY_UPGRADED)
    ) {
      state.isUpgrading = true;
      state.currentStage = 'completed';
      if (!state.stageTimestamps.completed && eventTime) {
        state.stageTimestamps.completed = eventTime;
      }
      continue;
    }

    // Handle failures (Warning-type events)
    if (eventType === 'Warning') {
      if (reason === EVENT_REASONS.CORDON && message.toLowerCase().includes('failed')) {
        state.isUpgrading = true;
        if (!state.currentStage) state.currentStage = 'cordon';
        state.failedStage = 'cordon';
        state.failureMessage = message;
        continue;
      }
      if (reason === EVENT_REASONS.DRAIN && message.includes(EVENT_MESSAGES.DRAINING_ERROR)) {
        state.isUpgrading = true;
        if (!state.currentStage) state.currentStage = 'drain';
        state.failedStage = 'drain';
        state.failureMessage = message;
        continue;
      }
      if (reason === EVENT_REASONS.UPGRADE && message.includes(EVENT_MESSAGES.UNABLE_TO_DELETE)) {
        state.isUpgrading = true;
        if (!state.currentStage) state.currentStage = 'deleteNode';
        state.failedStage = 'deleteNode';
        state.failureMessage = message;
        continue;
      }
      if (reason === EVENT_REASONS.UPGRADE && message.includes(EVENT_MESSAGES.FAILED_TO_REIMAGE)) {
        state.isUpgrading = true;
        if (!state.currentStage) state.currentStage = 'reimage';
        state.failedStage = 'reimage';
        state.failureMessage = message;
        continue;
      }
    }
  }

  return stateMap;
}

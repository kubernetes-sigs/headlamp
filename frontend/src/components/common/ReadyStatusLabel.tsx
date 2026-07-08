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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StatusLabel, StatusLabelProps } from './Label';

export interface ReadyStatusLabelProps {
  /**
   * The condition's status value, typically from a Ready-type condition
   * (e.g. via getReadyCondition). Also accepts arbitrary strings so callers
   * can pass a synthetic status for cases like "Suspended".
   */
  status: 'True' | 'False' | 'Unknown' | string;
  /** Optional reason, appended to the tooltip when present. */
  reason?: string;
  /** Optional message, appended to the tooltip when present. */
  message?: string;
  /** Label shown when status is 'True'. Defaults to the translated 'Ready'. */
  readyLabel?: string;
  /** Label shown when status is 'False'. Defaults to the translated 'Not Ready'. */
  notReadyLabel?: string;
  /** Label shown for any other status value. Defaults to the status itself, or the translated 'Unknown'. */
  unknownLabel?: string;
}

/**
 * ReadyStatusLabel renders a single StatusLabel chip for a Kubernetes Ready-type condition.
 *
 * This is intended to replace the near-identical StatusLabel components duplicated across
 * plugins (karpenter/src/common/StatusLabel.tsx, flux/src/common/StatusLabel.tsx,
 * knative/src/components/common/ReadyStatusLabel.tsx), which all derive a coloured chip
 * from a condition's status/reason/message using the same mapping.
 *
 * This component is intentionally presentational: it does not look up the condition or
 * apply resource-specific overrides (e.g. spec.suspend). Callers should use getReadyCondition
 * (in ConditionList.tsx) to find the condition, apply any plugin-specific overrides to derive
 * the effective status/label, and pass the result in here.
 *
 * The reason/message tooltip is rendered via StatusLabel's own `title` prop, which already
 * routes through the shared LightTooltip (with pre-line whitespace handling), so this
 * component does not wrap StatusLabel in a second, separate tooltip.
 *
 * Colour rules:
 * - status === 'True'  -> 'success'
 * - status === 'False' -> 'error'
 * - anything else      -> 'warning'
 *
 * @example
 * // Basic usage with a Ready condition
 * const ready = getReadyCondition(resource.status?.conditions);
 * <ReadyStatusLabel status={ready?.status ?? 'Unknown'} reason={ready?.reason} message={ready?.message} />
 *
 * @example
 * // Plugin-specific override (e.g. a suspended resource)
 * <ReadyStatusLabel status="Unknown" unknownLabel="Suspended" />
 */
export function ReadyStatusLabel({
  status,
  reason,
  message,
  readyLabel,
  notReadyLabel,
  unknownLabel,
}: ReadyStatusLabelProps) {
  const { t } = useTranslation(['translation']);
  let severity: StatusLabelProps['status'];
  let label: string;

  if (status === 'True') {
    severity = 'success';
    label = readyLabel || t('translation|Ready');
  } else if (status === 'False') {
    severity = 'error';
    label = notReadyLabel || t('translation|Not Ready');
  } else {
    severity = 'warning';
    label = unknownLabel || status || t('translation|Unknown');
  }

  const tooltipLines = [label];
  if (reason) tooltipLines.push(`Reason: ${reason}`);
  if (message) tooltipLines.push(`Message: ${message}`);

  return (
    <StatusLabel status={severity} title={tooltipLines.join('\n')}>
      {label}
    </StatusLabel>
  );
}

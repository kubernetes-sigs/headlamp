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
import { StatusLabel, StatusLabelProps } from './Label';

export interface PhaseLabelProps {
  /**
   * The phase string, typically from resource.status.phase.
   * Renders nothing when null or undefined.
   */
  phase: string | undefined | null;
  /**
   * The phase value that should render as 'success'.
   * Defaults to 'Active', which covers Namespace and most core resources.
   */
  successPhase?: string;
  /**
   * Optional list of phase values that should render as 'warning'.
   * Any phase not matching successPhase and not in warningPhases renders as 'error'.
   */
  warningPhases?: string[];
}

/**
 * PhaseLabel renders a Kubernetes .status.phase string as a coloured StatusLabel.
 *
 * The component replaces scattered inline phase-to-status mappings that existed in
 * namespace/Details.tsx, namespace/List.tsx, portforward/index.tsx, and the
 * storage-specific StatusLabelByPhase helper in storage/utils.tsx.
 *
 * Colour rules:
 * - phase === successPhase                   -> 'success'
 * - phase is in warningPhases (if provided)  -> 'warning'
 * - anything else                            -> 'error'
 *
 * @example
 * // Namespace (Active is the success phase, which is the default)
 * <PhaseLabel phase={namespace.status.phase} />
 *
 * @example
 * // PersistentVolume (Bound = success, Available = warning)
 * <PhaseLabel phase={pv.status.phase} successPhase="Bound" warningPhases={['Available']} />
 *
 * @example
 * // Port forward running check
 * <PhaseLabel phase={pf.status} successPhase={PORT_FORWARD_RUNNING_STATUS} />
 */
export function PhaseLabel({
  phase,
  successPhase = 'Active',
  warningPhases = [],
}: PhaseLabelProps) {
  if (phase === undefined || phase === null) {
    return null;
  }

  let status: StatusLabelProps['status'];
  if (phase === successPhase) {
    status = 'success';
  } else if (warningPhases.includes(phase)) {
    status = 'warning';
  } else {
    status = 'error';
  }

  return <StatusLabel status={status}>{phase}</StatusLabel>;
}

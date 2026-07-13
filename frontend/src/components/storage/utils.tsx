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
import { PhaseLabel } from '../common/PhaseLabel';

/**
 * @deprecated Use PhaseLabel from common/PhaseLabel directly.
 * Note: the t translation argument has been removed. Callers
 * that previously passed t as a second argument must be updated.
 */
export function StatusLabelByPhase(phase: string) {
  return <PhaseLabel phase={phase} successPhase="Bound" warningPhases={['Available']} />;
}

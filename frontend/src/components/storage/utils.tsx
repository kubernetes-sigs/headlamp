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

import { StatusLabel } from '../common/Label';

export function StatusLabelByPhase(phase: string, t: (key: string) => string) {
  const phaseMap: { [key: string]: string } = {
    Pending: t('glossary|Pending'),
    Available: t('glossary|Available'),
    Bound: t('glossary|Bound'),
    Released: t('glossary|Released'),
    Failed: t('glossary|Failed'),
    Lost: t('glossary|Lost'),
  };

  return (
    <StatusLabel
      status={phase === 'Bound' ? 'success' : phase === 'Available' ? 'warning' : 'error'}
    >
      {phaseMap[phase] || phase}
    </StatusLabel>
  );
}

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

import { useTranslation } from 'react-i18next';
import type { KubeCondition } from '../../lib/k8s/cluster';
import type { StatusLabelProps } from '../common/Label';
import { StatusLabel } from '../common/Label';

type Translate = (key: string) => string;

/**
 * Text of the scheduling condition of a pod group.
 *
 * These conditions are terminal: they report whether the group ever met its scheduling
 * requirement, not whether its pods are running now.
 * @param condition - The scheduling condition, when the group already has one.
 * @param t - The translation function of the calling view.
 * @returns The reason of the condition, or a localized fallback.
 */
export function getSchedulingStatusText(
  condition: KubeCondition | undefined,
  t: Translate
): string {
  if (!condition) {
    return t('translation|Unknown');
  }
  if (condition.reason) {
    return condition.reason;
  }
  if (condition.status === 'True') {
    return t('translation|Scheduled');
  }
  return condition.status === 'False' ? t('translation|Pending') : t('translation|Unknown');
}

function getSchedulingStatusSeverity(condition: KubeCondition): StatusLabelProps['status'] {
  if (condition.status === 'True') {
    return 'success';
  }
  return condition.status === 'False' ? 'warning' : '';
}

/** Shows whether a group met its scheduling requirement, from its scheduling condition. */
export function SchedulingStatus({ condition }: { condition: KubeCondition | undefined }) {
  const { t } = useTranslation(['translation']);

  if (!condition) {
    return <span>{t('translation|Unknown')}</span>;
  }

  return (
    <StatusLabel status={getSchedulingStatusSeverity(condition)}>
      {getSchedulingStatusText(condition, t)}
    </StatusLabel>
  );
}

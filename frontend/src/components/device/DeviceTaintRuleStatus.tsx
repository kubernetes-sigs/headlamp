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

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type DeviceTaintRule from '../../lib/k8s/deviceTaintRule';
import { StatusLabel, type StatusLabelProps } from '../common/Label';

export function getDeviceTaintRuleStatusText(rule: DeviceTaintRule, t: TFunction): string {
  if (rule.evictionInProgress === true) {
    return t('translation|Eviction in progress');
  }
  if (rule.evictionInProgress === false) {
    return t('translation|No eviction in progress');
  }
  return t('translation|Unknown');
}

function getStatus(rule: DeviceTaintRule): StatusLabelProps['status'] {
  if (rule.evictionInProgress === true) {
    return 'warning';
  }
  if (rule.evictionInProgress === false) {
    return 'success';
  }
  return '';
}

export default function DeviceTaintRuleStatus({ rule }: { rule: DeviceTaintRule }) {
  const { t } = useTranslation(['translation']);

  return (
    <StatusLabel status={getStatus(rule)}>{getDeviceTaintRuleStatusText(rule, t)}</StatusLabel>
  );
}

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
import type ResourceClaim from '../../lib/k8s/resourceClaim';
import { StatusLabel, type StatusLabelProps } from '../common/Label';

/**
 * The state of a claim as a sentence, for a table cell or a details row.
 *
 * A claim has no phase field, so the text is composed: it is pending until the
 * scheduler writes an allocation, and once allocated it names how many consumers
 * are reserved for it.
 * @param claim - The claim to describe.
 * @param t - The translation function of the caller.
 * @returns The text for the claim's state.
 */
export function getResourceClaimStatusText(claim: ResourceClaim, t: TFunction): string {
  switch (claim.state) {
    case 'Pending':
      return t('translation|Pending');
    case 'Allocated':
      return t('translation|Allocated');
    case 'InUse':
      return t('translation|In use by {{count}}', { count: claim.consumers.length });
    default:
      return '';
  }
}

/** Which of the shared label styles each state uses. */
const statusLabelStates: Record<ResourceClaim['state'], StatusLabelProps['status']> = {
  Pending: '',
  Allocated: 'success',
  InUse: 'success',
};

export interface ResourceClaimStatusProps {
  claim: ResourceClaim;
}

/** The composed state of a resource claim, as a status label. */
export default function ResourceClaimStatus({ claim }: ResourceClaimStatusProps) {
  const { t } = useTranslation(['translation']);

  return (
    <StatusLabel status={statusLabelStates[claim.state]}>
      {getResourceClaimStatusText(claim, t)}
    </StatusLabel>
  );
}

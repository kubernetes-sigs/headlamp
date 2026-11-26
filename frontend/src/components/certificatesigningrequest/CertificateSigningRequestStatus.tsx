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
import type { CertificateSigningRequestState } from '../../lib/k8s/certificateSigningRequest';
import { StatusLabel, type StatusLabelProps } from '../common/Label';

/**
 * The state of a request as a word, for a table cell or a details row.
 *
 * Each state is spelled out as its own key so the i18n extractor finds all of
 * them. The state itself stays untranslated, so a column keeps sorting and
 * filtering on the same value in every language.
 * @param state - The state to describe.
 * @param t - The translation function of the caller.
 * @returns The text for the request's state.
 */
export function getCertificateSigningRequestStateText(
  state: CertificateSigningRequestState,
  t: TFunction
): string {
  switch (state) {
    case 'Pending':
      return t('translation|Pending');
    case 'Approved':
      return t('translation|Approved');
    case 'Denied':
      return t('translation|Denied');
    case 'Failed':
      return t('translation|Failed');
    case 'Issued':
      return t('translation|Issued');
    default:
      return '';
  }
}

/**
 * Which of the shared label styles each state uses.
 *
 * A pending request is the one that needs someone to act, so it is called out rather
 * than left unstyled; denied and failed are errors, and an approved or issued request
 * needs nothing from anyone.
 */
const statusLabelStates: Record<CertificateSigningRequestState, StatusLabelProps['status']> = {
  Pending: 'warning',
  Approved: 'success',
  Denied: 'error',
  Failed: 'error',
  Issued: 'success',
};

export interface CertificateSigningRequestStatusProps {
  state: CertificateSigningRequestState;
}

/** The state of a certificate signing request, as a status label. */
export default function CertificateSigningRequestStatus({
  state,
}: CertificateSigningRequestStatusProps) {
  const { t } = useTranslation(['translation']);

  return (
    <StatusLabel status={statusLabelStates[state]}>
      {getCertificateSigningRequestStateText(state, t)}
    </StatusLabel>
  );
}

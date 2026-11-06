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

import { act, render, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/config';
import en from '../../i18n/locales/en/translation.json';
import type { CertificateSigningRequestState } from '../../lib/k8s/certificateSigningRequest';
import { TestContext } from '../../test';
import CertificateSigningRequestStatus, {
  getCertificateSigningRequestStateText,
} from './CertificateSigningRequestStatus';

const t = ((key: string) => key) as unknown as TFunction;

const states: CertificateSigningRequestState[] = [
  'Pending',
  'Approved',
  'Denied',
  'Failed',
  'Issued',
];

function renderStatus(state: CertificateSigningRequestState) {
  render(
    <TestContext>
      <CertificateSigningRequestStatus state={state} />
    </TestContext>
  );
}

describe('getCertificateSigningRequestStateText', () => {
  it.each(states)('asks for the %s translation by its own key', state => {
    expect(getCertificateSigningRequestStateText(state, t)).toBe(`translation|${state}`);
  });

  it.each(states)('has %s in the English bundle for the extractor to find', state => {
    expect(en).toHaveProperty(state);
  });
});

describe('CertificateSigningRequestStatus', () => {
  // Put the shared i18n instance back to English for the tests that follow.
  // Wrapped in act() since the label mounted above re-renders when the
  // language changes.
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('calls out a pending request, since that is the one waiting on a human', () => {
    renderStatus('Pending');

    expect(screen.getByText('Pending')).toBeVisible();
  });

  it.each(['Denied', 'Failed'] as CertificateSigningRequestState[])(
    'shows %s as an error',
    state => {
      renderStatus(state);

      expect(screen.getByText(state)).toBeVisible();
    }
  );

  it.each(['Approved', 'Issued'] as CertificateSigningRequestState[])(
    'shows %s without asking for attention',
    state => {
      renderStatus(state);

      expect(screen.getByText(state)).toBeVisible();
    }
  );

  it('labels the state in the chosen language', async () => {
    await act(() => i18n.changeLanguage('fr'));

    renderStatus('Pending');

    expect(screen.getByText('En attente')).toBeVisible();
  });

  it('labels a failed request in the chosen language too', async () => {
    await act(() => i18n.changeLanguage('fr'));

    renderStatus('Failed');

    expect(screen.getByText('Échoué(s)')).toBeVisible();
  });
});

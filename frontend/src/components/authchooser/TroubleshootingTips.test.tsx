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

import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n/config';
import { TestContext } from '../../test';
import TroubleshootingTips from './TroubleshootingTips';

describe('TroubleshootingTips', () => {
  it('renders tips when error message contains "Bad Gateway"', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Bad Gateway" />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
    expect(screen.getByText('minikube status')).toBeInTheDocument();
    expect(screen.getByText('kubectl cluster-info')).toBeInTheDocument();
    expect(screen.getByText('minikube update-context')).toBeInTheDocument();
    expect(screen.getByText('View full troubleshooting guide →')).toBeInTheDocument();
  });

  it('renders tips when error message contains "502"', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Error 502: upstream not available" />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
  });

  it('renders tips when error message contains "ECONNREFUSED"', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="connect ECONNREFUSED 127.0.0.1:6443" />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
  });

  it('renders tips when error message contains "failed to connect"', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Failed to connect to cluster" />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
  });

  it('renders tips when error message is "Unreachable"', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Unreachable" />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
  });

  it('renders tips when error message is "Request timed-out"', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Request timed-out" />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
  });

  it('renders tips when errorStatus is 502', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Some error" errorStatus={502} />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
  });

  it('renders tips when errorStatus is 408', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Some error" errorStatus={408} />
        </TestContext>
      </I18nextProvider>
    );

    expect(screen.getByText('Common fixes:')).toBeInTheDocument();
  });

  it('does not render for auth errors (401/403)', () => {
    const { container, rerender } = render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Unauthorized: 401" errorStatus={401} />
        </TestContext>
      </I18nextProvider>
    );

    expect(container.innerHTML).toBe('');

    rerender(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Forbidden: 403" errorStatus={403} />
        </TestContext>
      </I18nextProvider>
    );

    expect(container.innerHTML).toBe('');
  });

  it('does not render for generic errors', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <TestContext>
          <TroubleshootingTips errorMessage="Something went wrong" />
        </TestContext>
      </I18nextProvider>
    );

    expect(container.innerHTML).toBe('');
  });
});

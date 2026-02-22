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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestContext } from '../../test';
import { PureAuthToken, PureAuthTokenProps } from './Auth';

// vi.hoisted runs before imports, making values available to vi.mock factories
const { MockKubeObject, mockSetToken, mockTestAuth, mockGetCluster } = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    constructor(data: any) {
      this.jsonData = data;
    }
  }
  return {
    MockKubeObject,
    mockSetToken: vi.fn(),
    mockTestAuth: vi.fn(),
    mockGetCluster: vi.fn(() => 'test-cluster'),
  };
});

// --- K8s module mocks ---

vi.mock('../../lib/k8s/KubeObject', () => ({
  KubeObject: MockKubeObject,
}));

vi.mock('../../lib/k8s/deployment', () => ({
  default: class Deployment extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: class Pod extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../lib/k8s/daemonSet', () => ({
  default: class DaemonSet extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../lib/k8s/replicaSet', () => ({
  default: class ReplicaSet extends MockKubeObject {},
  __esModule: true,
}));

vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => ({ 'test-cluster': {} }),
}));

// --- Theme mock (TestContext has no MUI ThemeProvider, so palette.navbar is undefined) ---

vi.mock('../../lib/themes', () => ({
  useNavBarMode: () => 'light',
  getThemeName: () => 'light',
}));

// --- Auth-specific mocks ---

vi.mock('../../lib/auth', () => ({
  setToken: (...args: any[]) => mockSetToken(...args),
}));

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  testAuth: (...args: any[]) => mockTestAuth(...args),
}));

vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal()),
  getCluster: () => mockGetCluster(),
  getClusterPrefixedPath: () => '/c/:cluster',
}));

// Dynamic import after mocks are set up
const { default: AuthToken } = await import('./Auth');

// --- Helpers ---

/** Returns default props for PureAuthToken, with vi.fn() callbacks. */
function defaultProps(overrides: Partial<PureAuthTokenProps> = {}): PureAuthTokenProps {
  return {
    title: 'Authentication',
    token: '',
    showError: false,
    showActions: false,
    onCancel: vi.fn(),
    onChangeToken: vi.fn(),
    onAuthClicked: vi.fn(),
    onCloseError: vi.fn(),
    ...overrides,
  };
}

function renderPure(overrides: Partial<PureAuthTokenProps> = {}) {
  const props = defaultProps(overrides);
  const result = render(
    <TestContext>
      <PureAuthToken {...props} />
    </TestContext>
  );
  return { ...result, props };
}

// --- Tests ---

describe('PureAuthToken', () => {
  it('renders the dialog title', () => {
    renderPure({ title: 'Authentication: my-cluster' });

    expect(screen.getByText('Authentication: my-cluster')).toBeInTheDocument();
  });

  it('renders the token input field', () => {
    renderPure();

    expect(screen.getByLabelText('ID token')).toBeInTheDocument();
  });

  it('renders the "Please paste your authentication token" prompt', () => {
    renderPure();

    expect(screen.getByText('Please paste your authentication token.')).toBeInTheDocument();
  });

  it('renders the Authenticate button', () => {
    renderPure();

    expect(screen.getByRole('button', { name: /Authenticate/i })).toBeInTheDocument();
  });

  it('renders the service account token docs link', () => {
    renderPure();

    const link = screen.getByRole('link', { name: /service account token/i });
    expect(link).toBeInTheDocument();
  });

  it('shows error snackbar when showError is true', () => {
    renderPure({ showError: true });

    expect(screen.getByText('Error authenticating')).toBeInTheDocument();
  });

  it('does not show error snackbar when showError is false', () => {
    renderPure({ showError: false });

    expect(screen.queryByText('Error authenticating')).not.toBeInTheDocument();
  });

  it('shows Cancel button when showActions is true', () => {
    renderPure({ showActions: true });

    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('does not show Cancel button when showActions is false', () => {
    renderPure({ showActions: false });

    expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
  });

  it('calls onChangeToken when typing in the token field', () => {
    const { props } = renderPure();

    const tokenField = screen.getByLabelText('ID token');
    fireEvent.change(tokenField, { target: { value: 'my-token' } });

    expect(props.onChangeToken).toHaveBeenCalled();
  });

  it('calls onAuthClicked when Authenticate button is clicked', () => {
    const { props } = renderPure();

    fireEvent.click(screen.getByRole('button', { name: /Authenticate/i }));

    expect(props.onAuthClicked).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const { props } = renderPure({ showActions: true });

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('AuthToken (stateful)', () => {
  beforeEach(() => {
    mockSetToken.mockReset();
    mockTestAuth.mockReset();
    mockGetCluster.mockReturnValue('test-cluster');
  });

  it('shows error snackbar after authentication failure', async () => {
    mockSetToken.mockResolvedValue(undefined);
    mockTestAuth.mockRejectedValue({ status: 401, message: 'Unauthorized' });

    render(
      <TestContext>
        <AuthToken />
      </TestContext>
    );

    const tokenField = screen.getByLabelText('ID token');
    fireEvent.change(tokenField, { target: { value: 'bad-token' } });

    fireEvent.click(screen.getByRole('button', { name: /Authenticate/i }));

    await waitFor(() => {
      expect(screen.getByText('Error authenticating')).toBeInTheDocument();
    });
  });

  it('clears the token field after authentication failure', async () => {
    mockSetToken.mockResolvedValue(undefined);
    mockTestAuth.mockRejectedValue({ status: 401, message: 'Unauthorized' });

    render(
      <TestContext>
        <AuthToken />
      </TestContext>
    );

    const tokenField = screen.getByLabelText('ID token');
    fireEvent.change(tokenField, { target: { value: 'bad-token' } });

    fireEvent.click(screen.getByRole('button', { name: /Authenticate/i }));

    await waitFor(() => {
      expect(tokenField).toHaveValue('');
    });
  });
});

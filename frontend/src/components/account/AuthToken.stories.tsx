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

import { Meta, StoryFn } from '@storybook/react';
import { delay, http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { TestContext } from '../../test';
import AuthToken, { PureAuthToken, PureAuthTokenProps } from './Auth';

// --- Constants for stateful AuthToken stories ---
const CLUSTER_NAME = 'test-cluster';
const MOCK_PATH = `/c/${CLUSTER_NAME}`;
const INITIAL_PATH = window.location.pathname;
const SET_TOKEN_URL = `*/clusters/${CLUSTER_NAME}/set-token`;
const AUTH_URL = `*/clusters/${CLUSTER_NAME}/apis/authorization.k8s.io/v1/selfsubjectrulesreviews`;

export default {
  title: 'AuthToken',
  component: PureAuthToken,
  argTypes: {
    onCancel: { action: 'cancel clicked' },
    onAuthClicked: { action: 'auth clicked' },
    onChangeToken: { action: 'token changed' },
    onCloseError: { action: 'error closed' },
  },
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

// --- PureAuthToken stories (presentational, no MSW) ---

const Template: StoryFn<PureAuthTokenProps> = args => <PureAuthToken {...args} />;

/**
 * Error state — the error snackbar is visible, indicating
 * an authentication failure.
 */
export const ShowError = Template.bind({});
ShowError.args = {
  title: 'a title',
  token: 'a token',
  showError: true,
  showActions: false,
};

/**
 * Actions visible — the Cancel button is shown, used when
 * multiple clusters are configured.
 */
export const ShowActions = Template.bind({});
ShowActions.args = {
  title: 'a title',
  token: 'a token',
  showError: false,
  showActions: true,
};

/**
 * Default empty form — the token input field is empty and ready
 * for the user to paste an authentication token.
 */
export const TokenInputForm = Template.bind({});
TokenInputForm.args = {
  title: 'Authentication',
  token: '',
  showError: false,
  showActions: false,
};
TokenInputForm.parameters = {
  storyshots: { disable: true },
};
TokenInputForm.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  const tokenField = canvas.getByLabelText('ID token');
  await userEvent.type(tokenField, 'my-test-token');

  await waitFor(() => {
    expect(tokenField).toHaveValue('my-test-token');
  });
};

/**
 * Invalid token error — the error snackbar is shown upon
 * authentication failure with an invalid token.
 */
export const InvalidTokenError = Template.bind({});
InvalidTokenError.args = {
  title: 'Authentication',
  token: '',
  showError: true,
  showActions: false,
};
InvalidTokenError.parameters = {
  storyshots: { disable: true },
};
InvalidTokenError.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  await waitFor(() => {
    expect(canvas.getByText('Error authenticating')).toBeInTheDocument();
  });
};

/**
 * Cancel button visible — multiple clusters are configured,
 * so the user can cancel and return to cluster selection.
 */
export const WithCancelButton = Template.bind({});
WithCancelButton.args = {
  title: 'Authentication: production-cluster',
  token: '',
  showError: false,
  showActions: true,
};
WithCancelButton.parameters = {
  storyshots: { disable: true },
};
WithCancelButton.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  const cancelButton = canvas.getByRole('button', { name: /Cancel/i });
  expect(cancelButton).toBeInTheDocument();
  await userEvent.click(cancelButton);
};

// --- Stateful AuthToken stories (with MSW) ---

const StatefulTemplate: StoryFn = () => <AuthToken />;

const statefulDecorator = (Story: StoryFn) => {
  // Set URL so getCluster() returns our cluster name
  window.history.replaceState({}, '', INITIAL_PATH);
  window.history.replaceState({}, '', MOCK_PATH);

  const Wrapper = () => {
    useEffect(() => {
      return () => {
        window.history.replaceState({}, '', INITIAL_PATH);
      };
    }, []);

    return <Story />;
  };

  return (
    <TestContext routerMap={{ cluster: CLUSTER_NAME }} urlPrefix="/c">
      <Wrapper />
    </TestContext>
  );
};

/**
 * Successful authentication — the token is accepted and the
 * user is redirected to the cluster dashboard.
 */
export const SuccessRedirect = StatefulTemplate.bind({});
SuccessRedirect.decorators = [statefulDecorator];
SuccessRedirect.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: [
      http.post(SET_TOKEN_URL, () => HttpResponse.json({ ok: true })),
      http.post(AUTH_URL, () =>
        HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
      ),
    ],
  },
};
SuccessRedirect.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  const tokenField = canvas.getByLabelText('ID token');
  await userEvent.type(tokenField, 'valid-token-12345');

  const authButton = canvas.getByRole('button', { name: /Authenticate/i });
  await userEvent.click(authButton);
};

/**
 * Network error — the API returns a 401 Unauthorized response,
 * triggering the error snackbar.
 */
export const NetworkError = StatefulTemplate.bind({});
NetworkError.decorators = [statefulDecorator];
NetworkError.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: [
      http.post(SET_TOKEN_URL, () => HttpResponse.json({ ok: true })),
      http.post(AUTH_URL, () =>
        HttpResponse.json({ message: 'Unauthorized', status: 401 }, { status: 401 })
      ),
    ],
  },
};
NetworkError.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  const tokenField = canvas.getByLabelText('ID token');
  await userEvent.type(tokenField, 'invalid-token');

  const authButton = canvas.getByRole('button', { name: /Authenticate/i });
  await userEvent.click(authButton);

  await waitFor(() => {
    expect(canvas.getByText('Error authenticating')).toBeInTheDocument();
  });
};

/**
 * Timeout error — the API never responds, simulating a request
 * that hangs indefinitely.
 */
export const TimeoutError = StatefulTemplate.bind({});
TimeoutError.decorators = [statefulDecorator];
TimeoutError.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: [
      http.post(SET_TOKEN_URL, () => HttpResponse.json({ ok: true })),
      http.post(AUTH_URL, async () => {
        // Simulate a request that never completes (times out)
        await delay('infinite');
        return HttpResponse.json({});
      }),
    ],
  },
};
TimeoutError.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  const tokenField = canvas.getByLabelText('ID token');
  await userEvent.type(tokenField, 'timeout-token');

  const authButton = canvas.getByRole('button', { name: /Authenticate/i });
  await userEvent.click(authButton);
};

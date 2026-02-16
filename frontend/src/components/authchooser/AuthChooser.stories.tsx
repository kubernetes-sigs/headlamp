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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { expect, waitFor, within } from 'storybook/test';
import { initialState as CLUSTER_ACTIONS_INITIAL_STATE } from '../../redux/clusterActionSlice';
import { initialState as CLUSTER_PROVIDER_INITIAL_STATE } from '../../redux/clusterProviderSlice';
import { initialState as CONFIG_INITIAL_STATE } from '../../redux/configSlice';
import { initialState as FILTER_INITIAL_STATE } from '../../redux/filterSlice';
import { listenerMiddleware } from '../../redux/headlampEventSlice';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import AuthChooser, { PureAuthChooser, PureAuthChooserProps } from './index';

export default {
  title: 'AuthChooser',
  component: PureAuthChooser,
  argTypes: {
    handleOidcAuth: { action: 'oidc code arrived' },
    handleTokenAuth: { action: 'use a token clicked' },
    handleTryAgain: { action: 'try again clicked' },
    handleBackButtonPress: { action: 'back button clicked' },
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

const Template: StoryFn<PureAuthChooserProps> = args => <PureAuthChooser {...args} />;

const argFixture = {
  clusterName: 'some-cluster',
  title: 'some title',
  testingTitle: 'some testing title',
  testingAuth: false,
  error: null,
  oauthUrl: 'http://example.com/',
  clusterAuthType: '',
};

const SELF_SUBJECT_RULES_REVIEW_URL =
  '*/clusters/:cluster/apis/authorization.k8s.io/v1/selfsubjectrulesreviews';

export const AuthMethodSelection = Template.bind({});
AuthMethodSelection.args = {
  ...argFixture,
  clusterAuthType: 'oidc',
  title: 'Select an authentication method',
};

export const TokenOnlyAuthMethod = Template.bind({});
TokenOnlyAuthMethod.args = {
  ...argFixture,
  clusterAuthType: '',
  title: 'Sign in with token',
};

export const LoadingStateDuringAuthFlow = Template.bind({});
LoadingStateDuringAuthFlow.args = {
  ...argFixture,
  testingAuth: true,
};

export const HaveClusters = Template.bind({});
HaveClusters.args = {
  ...argFixture,
  title: 'Select a cluster to sign in',
};

export const AuthenticationFailureError = Template.bind({});
AuthenticationFailureError.args = {
  ...argFixture,
  error: Error('Oh no! Some error happened?!?'),
};

export const AuthenticationFailureBadGateway = Template.bind({});
AuthenticationFailureBadGateway.args = {
  ...argFixture,
  error: Error('Bad Gateway'),
};

interface AuthChooserContainerStoryArgs {
  clusterName: string;
  clusterAuthType: string;
  useToken?: boolean;
  page: string;
}

function makeAuthChooserStore({
  clusterName,
  clusterAuthType,
  useToken,
}: Omit<AuthChooserContainerStoryArgs, 'page'>) {
  const cluster = {
    ...(CONFIG_INITIAL_STATE.clusters?.[clusterName] || {}),
    name: clusterName,
    auth_type: clusterAuthType,
    useToken,
  };
  const preloadedState = {
    filter: structuredClone(FILTER_INITIAL_STATE),
    config: {
      ...structuredClone(CONFIG_INITIAL_STATE),
      clusters: {
        [clusterName]: cluster,
      },
      allClusters: {
        [clusterName]: cluster,
      },
    },
    clusterAction: structuredClone(CLUSTER_ACTIONS_INITIAL_STATE),
    clusterProvider: structuredClone(CLUSTER_PROVIDER_INITIAL_STATE),
  };

  return configureStore({
    reducer: reducers,
    preloadedState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
        thunk: true,
      }).prepend(listenerMiddleware.middleware),
  });
}

function CurrentPath() {
  const location = useLocation();

  return <div data-testid="current-route">Current route: {location.pathname}</div>;
}

function SyncBrowserPath() {
  const location = useLocation();
  const previousPathRef = useRef('');
  const previousStateRef = useRef<unknown>(null);

  useEffect(() => {
    previousPathRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    previousStateRef.current = window.history.state;

    return () => {
      window.history.replaceState(previousStateRef.current, '', previousPathRef.current);
    };
  }, []);

  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    window.history.replaceState(window.history.state, '', currentPath);
  }, [location.pathname, location.search, location.hash]);

  return null;
}

const AuthChooserContainerTemplate: StoryFn<AuthChooserContainerStoryArgs> = args => {
  const { clusterName, clusterAuthType, useToken, page } = args;
  const routePath = `c/${clusterName}/${page}`;

  return (
    <TestContext
      store={makeAuthChooserStore({ clusterName, clusterAuthType, useToken })}
      routerMap={{ ':path*': routePath }}
    >
      <SyncBrowserPath />
      <AuthChooser />
      <CurrentPath />
    </TestContext>
  );
};

export const ContainerAuthenticationFailureError = AuthChooserContainerTemplate.bind({});
ContainerAuthenticationFailureError.args = {
  clusterName: 'some-cluster',
  clusterAuthType: '',
  page: 'login',
};
ContainerAuthenticationFailureError.parameters = {
  msw: {
    handlers: [
      http.post(SELF_SUBJECT_RULES_REVIEW_URL, () =>
        HttpResponse.json({ message: 'Bad Gateway' }, { status: 502, statusText: 'Bad Gateway' })
      ),
    ],
  },
};

export const ContainerRedirectAfterSuccess = AuthChooserContainerTemplate.bind({});
ContainerRedirectAfterSuccess.args = {
  clusterName: 'some-cluster',
  clusterAuthType: '',
  page: 'login',
};
ContainerRedirectAfterSuccess.parameters = {
  storyshots: {
    disable: true,
  },
  msw: {
    handlers: [http.post(SELF_SUBJECT_RULES_REVIEW_URL, () => HttpResponse.json({}))],
  },
};
ContainerRedirectAfterSuccess.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  await waitFor(() => {
    expect(canvas.getByTestId('current-route')).toHaveTextContent('Current route: /');
  });
};

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
import { delay, http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import appStore from '../../redux/stores/store';
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
  const baseState = appStore.getState();
  const cluster = {
    ...(baseState.config?.clusters?.[clusterName] || {}),
    name: clusterName,
    auth_type: clusterAuthType,
    useToken,
  };
  const preloadedState = {
    ...baseState,
    config: {
      ...baseState.config,
      clusters: {
        [clusterName]: cluster,
      },
      allClusters: {
        [clusterName]: cluster,
      },
    },
  };

  return configureStore({
    reducer: (state = preloadedState) => state,
    preloadedState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });
}

function CurrentPath() {
  const location = useLocation();

  return <div>Current route: {location.pathname}</div>;
}

function SyncBrowserPath({ path }: { path: string }) {
  useEffect(() => {
    const previousPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({}, '', path);

    return () => {
      window.history.replaceState({}, '', previousPath);
    };
  }, [path]);

  return null;
}

const AuthChooserContainerTemplate: StoryFn<AuthChooserContainerStoryArgs> = args => {
  const { clusterName, clusterAuthType, useToken, page } = args;
  const path = `/c/${clusterName}/${page}`;

  return (
    <TestContext
      store={makeAuthChooserStore({ clusterName, clusterAuthType, useToken })}
      urlPrefix="/c"
      routerMap={{ cluster: clusterName, ':page?': page }}
    >
      <SyncBrowserPath path={path} />
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
      http.post(
        'http://localhost:4466/clusters/:cluster/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
        () =>
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
  msw: {
    handlers: [
      http.post(
        'http://localhost:4466/clusters/:cluster/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
        async () => {
          await delay(200);
          return HttpResponse.json({});
        }
      ),
    ],
  },
};

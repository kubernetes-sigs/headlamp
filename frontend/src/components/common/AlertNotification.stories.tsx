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

import { Button } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import { SnackbarProvider, useSnackbar } from 'notistack';
import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { PureAlertNotification, PureAlertNotificationProps } from './AlertNotification';

const SnackbarDisplay: React.FC<{
  show: boolean;
  message: string;
  variant: 'error' | 'success' | 'info' | 'warning';
}> = ({ show, message, variant }) => {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const key = 'alert-notification-story';

  useEffect(() => {
    if (show) {
      enqueueSnackbar(message, {
        key,
        variant,
        persist: true,
        preventDuplicate: true,
        anchorOrigin: { vertical: 'top', horizontal: 'center' },
        action: snackbarId => (
          <Button
            onClick={() => closeSnackbar(snackbarId)}
            size="small"
            sx={{ color: 'common.white' }}
          >
            Dismiss (Story Action)
          </Button>
        ),
      });
    } else {
      closeSnackbar(key);
    }
    return () => closeSnackbar(key);
  }, [show, message, variant, enqueueSnackbar, closeSnackbar]);
  return null;
};

export default {
  title: 'AlertNotification',
  component: PureAlertNotification,
  decorators: [
    (Story, context: { args: StoryArgs }) => (
      <Provider store={store}>
        <MemoryRouter initialEntries={[context.args.initialRoute || '/cluster/test-cluster/pods']}>
          <TestContext routerMap={{ cluster: 'test-cluster' }}>
            <SnackbarProvider
              maxSnack={3}
              anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
              autoHideDuration={null}
            >
              <div
                style={{
                  position: 'relative',
                  minHeight: '100px',
                  border: '1px dashed lightgray',
                  padding: '10px',
                }}
              >
                <Story />
                {context.args.simulateSnackbar && (
                  <SnackbarDisplay
                    show={context.args.simulateSnackbar.show}
                    message={context.args.simulateSnackbar.message}
                    variant={context.args.simulateSnackbar.variant}
                  />
                )}
                <div
                  id="snackbar-container"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1400 }}
                ></div>
              </div>
            </SnackbarProvider>
          </TestContext>
        </MemoryRouter>
      </Provider>
    ),
  ],
  argTypes: {
    checkerFunction: { table: { disable: true } },
    initialRoute: { control: 'text' },
    simulateOffline: { control: 'boolean' },
    simulateSnackbar: { control: 'object' },
  },
} as Meta<typeof PureAlertNotification & StoryArgs>;

interface StoryArgs extends PureAlertNotificationProps {
  initialRoute?: string;
  simulateOffline?: boolean;
  simulateSnackbar?: {
    show: boolean;
    message: string;
    variant: 'error' | 'success' | 'info' | 'warning';
  };
}

const Template: StoryFn<StoryArgs> = args => {
  const { checkerFunction, simulateOffline, ...rest } = args;
  let originalOnLine: PropertyDescriptor | undefined;

  if (typeof simulateOffline === 'boolean') {
    originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => !simulateOffline,
    });
  }

  useEffect(() => {
    return () => {
      if (typeof simulateOffline === 'boolean' && originalOnLine) {
        Object.defineProperty(window.navigator, 'onLine', originalOnLine);
      }
    };
  }, [simulateOffline, originalOnLine]);

  return <PureAlertNotification checkerFunction={checkerFunction} {...rest} />;
};

export const NoErrorInitially = Template.bind({});
NoErrorInitially.args = {
  checkerFunction: async () => Promise.resolve({ statusText: 'OK' }),
  simulateSnackbar: { show: false, message: '', variant: 'info' },
};
NoErrorInitially.storyName = 'No Error (Checker Resolves)';

export const ErrorOnCheck = Template.bind({});
ErrorOnCheck.args = {
  checkerFunction: async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return Promise.reject('Cluster unreachable (Simulated Error)');
  },
  simulateSnackbar: { show: true, message: 'Lost connection to the cluster.', variant: 'error' },
};
ErrorOnCheck.storyName = 'Error on Check (Checker Rejects)';

export const SimulatingOffline = Template.bind({});
SimulatingOffline.args = {
  checkerFunction: async () => Promise.resolve({ statusText: 'OK' }),
  simulateOffline: true,
};
SimulatingOffline.storyName = 'Navigator Offline';

export const OnExcludedRoute = Template.bind({});
OnExcludedRoute.args = {
  checkerFunction: async () => Promise.reject('Cluster unreachable (Simulated Error)'),
  initialRoute: '/c/test-cluster/login',
};
OnExcludedRoute.storyName = 'On Excluded Route (e.g., Login)';

export const OnNonClusterRoute = Template.bind({});
OnNonClusterRoute.args = {
  checkerFunction: async () => Promise.reject('Cluster unreachable (Simulated Error)'),
  initialRoute: '/settings/plugins',
  simulateSnackbar: { show: false, message: '', variant: 'info' },
};
OnNonClusterRoute.storyName = 'On Non-Cluster Route (e.g., Global Settings)';

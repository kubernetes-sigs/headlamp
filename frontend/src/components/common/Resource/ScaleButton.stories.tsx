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
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { getTestDate } from '../../../helpers/testHelpers';
import Deployment from '../../../lib/k8s/deployment';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { initialState as CLUSTER_ACTIONS_INITIAL_STATE } from '../../../redux/clusterActionSlice';
import { initialState as CLUSTER_PROVIDER_INITIAL_STATE } from '../../../redux/clusterProviderSlice';
import { initialState as CONFIG_INITIAL_STATE } from '../../../redux/configSlice';
import { initialState as FILTER_INITIAL_STATE } from '../../../redux/filterSlice';
import { listenerMiddleware } from '../../../redux/headlampEventSlice';
import reducers from '../../../redux/reducers/reducers';
import { TestContext } from '../../../test';
import ActionsNotifier from '../ActionsNotifier';
import ScaleButton from './ScaleButton';

function createTestStore() {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      filter: FILTER_INITIAL_STATE,
      config: CONFIG_INITIAL_STATE,
      clusterAction: CLUSTER_ACTIONS_INITIAL_STATE,
      clusterProvider: CLUSTER_PROVIDER_INITIAL_STATE,
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
        thunk: true,
      }).prepend(listenerMiddleware.middleware),
  });
}

function IsolatedTestContext({ children }: { children: React.ReactNode }) {
  const [store] = React.useState(() => createTestStore());
  return (
    <TestContext store={store}>
      <ActionsNotifier />
      {children}
    </TestContext>
  );
}

export default {
  title: 'Resource/ScaleButton',
  component: ScaleButton,
  decorators: [
    Story => (
      <IsolatedTestContext>
        <Story />
      </IsolatedTestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.post('*/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', () =>
            HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn<typeof ScaleButton> = args => <ScaleButton {...args} />;

function createMockDeployment(replicas = 3, scaleFn?: (numReplicas: number) => Promise<any>) {
  const deployment = new Deployment({
    metadata: {
      name: 'mock-deployment',
      namespace: 'default',
      creationTimestamp: getTestDate().toDateString(),
      uid: 'mock-uid',
    },
    spec: {
      replicas,
      template: {
        spec: {
          nodeName: 'mock-node',
          containers: [
            {
              name: 'mock-container',
              image: 'mock-image',
              ports: [{ containerPort: 80 }],
              imagePullPolicy: 'Always',
            },
          ],
        },
      },
    },
    status: {},
    kind: 'Deployment',
  });
  if (scaleFn) {
    (deployment as any).scale = scaleFn;
  }
  return deployment;
}

const mockDeployment = createMockDeployment(3);

const mockStatefulSet = new StatefulSet({
  metadata: {
    name: 'mock-statefulset',
    namespace: 'default',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid',
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'headlamp' },
    },
    updateStrategy: {
      rollingUpdate: { partition: 1 },
      type: 'RollingUpdate',
    },
    template: {
      spec: {
        nodeName: 'mock-node',
        containers: [
          {
            name: 'mock-container',
            image: 'mock-image',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
    status: {},
  },
  status: {},
  kind: 'StatefulSet',
});

const mockReplicaSet = new ReplicaSet({
  metadata: {
    name: 'mock-statefulset',
    namespace: 'default',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid',
  },
  spec: {
    minReadySeconds: 0,
    replicas: 3,
    selector: {
      matchLabels: { app: 'headlamp' },
    },
    template: {
      spec: {
        nodeName: 'mock-node',
        containers: [
          {
            name: 'mock-container',
            image: 'mock-image',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    availableReplicas: 3,
    conditions: [],
    fullyLabeledReplicas: 3,
    observedGeneration: 3,
    readyReplicas: 2,
    replicas: 3,
  },
  kind: 'ReplicaSet',
});

export const DeploymentExample = Template.bind({});
DeploymentExample.args = {
  item: mockDeployment,
};

export const StatefulSetExample = Template.bind({});
StatefulSetExample.args = {
  item: mockStatefulSet,
};

export const ReplicaSetExample = Template.bind({});
ReplicaSetExample.args = {
  item: mockReplicaSet,
};

/**
 * Scale input form with dialog open and current replica count displayed in the input field.
 */
export const ScaleInputForm = Template.bind({});
ScaleInputForm.args = {
  item: createMockDeployment(3),
};
ScaleInputForm.parameters = {
  storyshots: { disable: true },
  docs: {
    description: {
      story:
        'Scale input form with the scale dialog open and current replica count displayed in the input field.',
    },
  },
};
ScaleInputForm.play = async ({ canvasElement }) => {
  const scaleButton = await within(canvasElement).findByRole('button', { name: /scale/i });
  await userEvent.click(scaleButton);

  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());

  const input = await screen.findByRole('spinbutton');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(3);
};

/**
 * Minimum-replica validation: at 0 replicas, the decrement button is disabled,
 * the input specifies min="0", typing negative numbers is clamped to 0, and Apply remains enabled.
 */
export const MinimumReplicaValidation = Template.bind({});
MinimumReplicaValidation.args = {
  item: createMockDeployment(0),
};
MinimumReplicaValidation.parameters = {
  storyshots: { disable: true },
  docs: {
    description: {
      story:
        'Demonstrates minimum-replica validation: at 0 replicas, the decrement button is disabled, the input specifies min="0", typing negative numbers is clamped to 0, and the Apply button remains enabled.',
    },
  },
};
MinimumReplicaValidation.play = async ({ canvasElement }) => {
  const scaleButton = await within(canvasElement).findByRole('button', { name: /scale/i });
  await userEvent.click(scaleButton);

  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());

  const input = await screen.findByRole('spinbutton');
  const decrementButton = screen.getByRole('button', { name: /decrement/i });

  await expect(input).toHaveValue(0);
  await expect(decrementButton).toBeDisabled();
  await expect(input).toHaveAttribute('min', '0');

  // Verify that pasting a negative value clamps to 0 via Math.max(0, Number(val))
  await userEvent.tripleClick(input);
  await userEvent.paste('-1');
  await expect(input).toHaveValue(0);
  await expect(decrementButton).toBeDisabled();

  const applyButton = screen.getByRole('button', { name: /apply/i });
  await expect(applyButton).toBeEnabled();
};

/**
 * Scale in progress: after confirming scale, the dialog closes and the action notifier
 * displays the in-progress notification with a Cancel button.
 */
export const ScaleInProgress = Template.bind({});
ScaleInProgress.args = {
  item: createMockDeployment(3, () => new Promise(() => {})),
};
ScaleInProgress.parameters = {
  storyshots: { disable: true },
  docs: {
    description: {
      story:
        'Scale in progress: after clicking Apply, the dialog closes and the action notifier displays the in-progress notification with a Cancel button.',
    },
  },
};
ScaleInProgress.play = async ({ canvasElement }) => {
  const scaleButton = await within(canvasElement).findByRole('button', { name: /scale/i });
  await userEvent.click(scaleButton);

  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());

  const applyButton = screen.getByRole('button', { name: /apply/i });
  await userEvent.click(applyButton);

  await waitFor(() => {
    expect(screen.getByText('Scaling mock-deployment…')).toBeVisible();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeVisible();
  });
};

/**
 * Scale success feedback: after the scale request succeeds, a success snackbar is displayed.
 */
export const ScaleSuccessFeedback = Template.bind({});
ScaleSuccessFeedback.args = {
  item: createMockDeployment(3, () => Promise.resolve({})),
};
ScaleSuccessFeedback.parameters = {
  storyshots: { disable: true },
  docs: {
    description: {
      story:
        'Scale success feedback: after the scale request succeeds, a success snackbar is displayed.',
    },
  },
};
ScaleSuccessFeedback.play = async ({ canvasElement }) => {
  const scaleButton = await within(canvasElement).findByRole('button', { name: /scale/i });
  await userEvent.click(scaleButton);

  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());

  const applyButton = screen.getByRole('button', { name: /apply/i });
  await userEvent.click(applyButton);

  await waitFor(
    () => {
      expect(screen.getByText('Scaled mock-deployment.')).toBeVisible();
    },
    { timeout: 8000 }
  );
};

/**
 * Scale error state: when a scale request fails, an error snackbar is displayed with details.
 */
export const ScaleErrorState = Template.bind({});
ScaleErrorState.args = {
  item: createMockDeployment(3, () => Promise.reject(new Error('Unauthorized or cluster error'))),
};
ScaleErrorState.parameters = {
  storyshots: { disable: true },
  docs: {
    description: {
      story:
        'Scale error state: when a scale request fails, an error snackbar is displayed with details.',
    },
  },
};
ScaleErrorState.play = async ({ canvasElement }) => {
  const scaleButton = await within(canvasElement).findByRole('button', { name: /scale/i });
  await userEvent.click(scaleButton);

  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());

  const applyButton = screen.getByRole('button', { name: /apply/i });
  await userEvent.click(applyButton);

  await waitFor(
    () => {
      expect(screen.getByText(/Failed to scale mock-deployment/i)).toBeVisible();
    },
    { timeout: 8000 }
  );
};

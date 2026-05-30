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

import { Meta, StoryFn, StoryObj } from '@storybook/react';
import { screen } from '@testing-library/react';
import { MRT_TableInstance } from 'material-react-table';
import { http, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { expect, userEvent, waitFor } from 'storybook/test';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { TestContext } from '../../../test';
import ActionsNotifier from '../ActionsNotifier';
import ResourceTableMultiActions from './ResourceTableMultiActions';

export default {
  title: 'Resource/ResourceTableMultiActions',
  component: ResourceTableMultiActions,
  decorators: [
    Story => (
      <TestContext>
        <SnackbarProvider>
          <ActionsNotifier />
          <Story />
        </SnackbarProvider>
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.post(
            'http://localhost:4466/clusters/local/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
          http.post(
            'http://localhost:4466/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
        ],
      },
    },
  },
} as Meta;

const MOCK_CLUSTER = 'local';

function makeMockTable(items: KubeObject[]): MRT_TableInstance<any> {
  return {
    getSelectedRowModel: () => ({
      rows: items.map(item => ({ original: item })),
      flatRows: items.map(item => ({ original: item })),
      rowsById: {},
    }),
    resetRowSelection: () => {},
    getIsSomeRowsSelected: () => items.length > 0,
    getIsAllRowsSelected: () => false,
  } as unknown as MRT_TableInstance<any>;
}

const mockDeployment = new Deployment(
  {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'deployment',
      namespace: 'default',
      uid: 'deployment-uid',
    },
  } as any,
  MOCK_CLUSTER
);

const mockDeploymentError = Object.assign(
  new Deployment(
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'deployment',
        namespace: 'default',
        uid: 'deployment-error-uid',
      },
    } as any,
    MOCK_CLUSTER
  ),
  {
    delete: async () => {
      throw new Error('Simulated delete error');
    },
    patch: async () => {
      throw new Error('Simulated patch error');
    },
  }
);

const mockStatefulSet = new StatefulSet(
  {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: 'statefulset',
      namespace: 'default',
      uid: 'statefulset-uid',
    },
  } as any,
  MOCK_CLUSTER
);

const mockDaemonSet = new DaemonSet(
  {
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: {
      name: 'daemonset',
      namespace: 'default',
      uid: 'daemonset-uid',
    },
  } as any,
  MOCK_CLUSTER
);

const mockReplicaSet = new ReplicaSet(
  {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: 'replicaset',
      namespace: 'default',
      uid: 'replicaset-uid',
    },
  } as any,
  MOCK_CLUSTER
);

// With only one Deployment
export const Default: StoryFn = () => (
  <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />
);

// Multiple restartable items of different kinds
export const WithRestartableItems: StoryFn = () => (
  <ResourceTableMultiActions
    table={makeMockTable([mockDeployment, mockStatefulSet, mockDaemonSet])}
  />
);

// Non-restartable resource
export const WithNonRestartableItems: StoryFn = () => (
  <ResourceTableMultiActions table={makeMockTable([mockReplicaSet])} />
);

// Mixed - one restartable + one non-restartable
export const WithMixedItems: StoryFn = () => (
  <ResourceTableMultiActions table={makeMockTable([mockDeployment, mockReplicaSet])} />
);

// Empty selection
export const EmptySelection: StoryFn = () => (
  <ResourceTableMultiActions table={makeMockTable([])} />
);

// Open scale dialog
export const ScaleDialogOpen: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Scale items'));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Scale items' })).toBeVisible());

    expect(screen.getByText(/deployment/i)).toBeVisible();
  },
};

// Cancel scale dialog
export const ScaleDialogCancel: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Scale items'));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Scale items' })).toBeVisible());

    await userEvent.click(screen.getByRole('button', { name: 'cancel-button' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Scale items' })).not.toBeInTheDocument()
    );
  },
};

// Confirm scale for multiple items
export const ScaleMultipleConfirm: StoryObj = {
  render: () => (
    <ResourceTableMultiActions
      table={makeMockTable([mockDeployment, mockStatefulSet, mockReplicaSet])}
    />
  ),
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Scale items'));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Scale items' })).toBeVisible());

    expect(screen.getByText(/deployment/i)).toBeVisible();
    expect(screen.getByText(/statefulset/i)).toBeVisible();
    expect(screen.getByText(/replicaset/i)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'confirm-button' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Scale items' })).not.toBeInTheDocument()
    );
  },
};

// Open delete confirmation dialogue
export const DeleteConfirmationDialogOpen: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Delete items'));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Delete items' })).toBeVisible());

    expect(screen.getByText(/deployment/i)).toBeVisible();
  },
};

// Cancel delete confirmation dialogue
export const DeleteConfirmationDialogCancel: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Delete items'));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Delete items' })).toBeVisible());

    await userEvent.click(screen.getByLabelText('cancel-button'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete items' })).not.toBeInTheDocument()
    );
  },
};

// Confirm delete confirmation dialogue
export const DeleteConfirmationDialogConfirm: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Delete items'));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Delete items' })).toBeVisible());

    await userEvent.click(screen.getByLabelText('confirm-button'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete items' })).not.toBeInTheDocument()
    );
  },
};

// Open restart confirmation dialogue
export const RestartConfirmationDialogOpen: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Restart items'));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Restart items' })).toBeVisible()
    );

    expect(screen.getByText(/deployment/i)).toBeVisible();
  },
};

// Cancel restart confirmation dialogue
export const RestartConfirmationDialogCancel: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeployment])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Restart items'));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Restart items' })).toBeVisible()
    );

    await userEvent.click(screen.getByLabelText('cancel-button'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Restart items' })).not.toBeInTheDocument()
    );
  },
};

// Confirm restart confirmation dialogue
export const RestartMultipleConfirm: StoryObj = {
  render: () => (
    <ResourceTableMultiActions
      table={makeMockTable([mockDeployment, mockStatefulSet, mockDaemonSet])}
    />
  ),
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Restart items'));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Restart items' })).toBeVisible()
    );

    expect(screen.getByText(/deployment/i)).toBeVisible();
    expect(screen.getByText(/statefulset/i)).toBeVisible();
    expect(screen.getByText(/daemonset/i)).toBeVisible();

    await userEvent.click(screen.getByLabelText('confirm-button'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Restart items' })).not.toBeInTheDocument()
    );
  },
};

// Delete Error
export const DeleteConfirmationDialogError: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeploymentError])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Delete items'));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Delete items' })).toBeVisible());

    await userEvent.click(screen.getByLabelText('confirm-button'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete items' })).not.toBeInTheDocument()
    );

    await waitFor(
      () => {
        expect(screen.getByText('Error deleting 1 items.')).toBeVisible();
      },
      { timeout: 3000 }
    );
  },
};

// Restart Error
export const RestartConfirmationDialogError: StoryObj = {
  render: () => <ResourceTableMultiActions table={makeMockTable([mockDeploymentError])} />,
  parameters: {
    storyshots: {
      disable: true,
    },
  },
  play: async () => {
    await userEvent.click(screen.getByLabelText('Restart items'));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Restart items' })).toBeVisible()
    );

    await userEvent.click(screen.getByLabelText('confirm-button'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Restart items' })).not.toBeInTheDocument()
    );

    // Check that the error snackbar appeared
    await waitFor(
      () => {
        expect(screen.getByText('Failed to restart 1 items.')).toBeVisible();
      },
      { timeout: 3000 }
    );
  },
};

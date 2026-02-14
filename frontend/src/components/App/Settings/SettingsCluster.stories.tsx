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
import React from 'react';
import { TestContext } from '../../../test';
import SettingsCluster from './SettingsCluster';

const mockClusterName = 'my-cluster';

function setupLocalStorage(clusterName: string, settings: Record<string, any> = {}) {
  localStorage.setItem(`cluster_settings.${clusterName}`, JSON.stringify(settings));
}

function getMockStore(clusters: Record<string, any> = {}) {
  return configureStore({
    reducer: {
      config: (
        state = {
          clusters,
          statelessClusters: {},
          allClusters: clusters,
          settings: {
            tableRowsPerPageOptions: [15, 25, 50],
            timezone: 'UTC',
            useEvict: true,
          },
        }
      ) => state,
      plugins: (state = { loaded: true }) => state,
      theme: (
        state = {
          name: 'light',
          logo: null,
          palette: { navbar: { background: '#fff' } },
        }
      ) => state,
      ui: (state = {}) => state,
      filter: (
        state = {
          namespaces: new Set(),
          search: '',
        }
      ) => state,
      resourceTable: (state = {}) => state,
      actionButtons: (state = []) => state,
      detailsViewSection: (state = {}) => state,
      routes: (state = { routes: {} }) => state,
      notifications: (state = { notifications: [] }) => state,
    },
  });
}

const mockClusters: Record<string, any> = {
  [mockClusterName]: {
    name: mockClusterName,
    auth_type: '',
    meta_data: {
      namespace: 'default',
      source: 'kubeconfig',
    },
  },
  'staging-cluster': {
    name: 'staging-cluster',
    auth_type: '',
    meta_data: {
      namespace: 'default',
      source: 'kubeconfig',
    },
  },
};

export default {
  title: 'Settings/SettingsCluster',
  component: SettingsCluster,
} as Meta<typeof SettingsCluster>;

/**
 * Default cluster settings form with a selected cluster.
 */
export const Default: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: '',
    allowedNamespaces: [],
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * Cluster settings form pre-populated with saved settings (allowed namespaces, default namespace).
 */
export const WithSavedSettings: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: 'my-app',
    allowedNamespaces: ['default', 'kube-system', 'my-app'],
    nodeShellTerminal: {
      isEnabled: true,
      namespace: 'kube-system',
      linuxImage: 'busybox:1.28',
    },
    podDebugTerminal: {
      isEnabled: true,
      debugImage: 'docker.io/library/busybox:latest',
    },
    appearance: {
      accentColor: '#1976d2',
      icon: 'mdi:kubernetes',
    },
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * No clusters configured — shows empty state message.
 */
export const NoClusters: StoryFn = () => {
  return (
    <TestContext store={getMockStore({})} urlSearchParams={{ c: 'nonexistent' }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * Selected cluster does not exist — shows error with cluster selector.
 */
export const InvalidCluster: StoryFn = () => {
  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: 'nonexistent-cluster' }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * Cluster settings showing namespace validation error.
 * Note: Type an invalid namespace (with spaces or capitals) in the "Default namespace"
 * or "Allowed namespaces" field to see the validation error message in action.
 * This story demonstrates the initial state ready for validation testing.
 */
export const NamespaceValidation: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: '',
    allowedNamespaces: [],
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * Cluster settings with appearance customization (accent color and icon set).
 */
export const WithAppearance: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: '',
    allowedNamespaces: [],
    appearance: {
      accentColor: '#e91e63',
      icon: 'mdi:cloud-outline',
    },
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * Dynamic cluster (removable) — would show remove button in Electron.
 */
export const DynamicCluster: StoryFn = () => {
  const dynamicClusters = {
    [mockClusterName]: {
      name: mockClusterName,
      auth_type: '',
      meta_data: {
        namespace: 'default',
        source: 'dynamic_cluster',
      },
    },
  };

  setupLocalStorage(mockClusterName, {
    defaultNamespace: 'production',
    allowedNamespaces: ['production', 'staging'],
  });

  return (
    <TestContext store={getMockStore(dynamicClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * Multiple allowed namespaces displayed as chips.
 */
export const MultipleAllowedNamespaces: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: 'default',
    allowedNamespaces: [
      'default',
      'kube-system',
      'monitoring',
      'logging',
      'ingress-nginx',
      'cert-manager',
    ],
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

/**
 * Demonstrates the appearance save loading state.
 * To see the loading state in action:
 * 1. Choose a color or icon using the pickers
 * 2. Click the "Apply" button
 * 3. The button will briefly show "Applying..." while saving
 *
 * This story shows the component ready for interaction.
 */
export const AppearanceSaving: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: '',
    allowedNamespaces: [],
    appearance: {
      accentColor: '#1976d2',
      icon: 'mdi:kubernetes',
    },
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

AppearanceSaving.parameters = {
  docs: {
    description: {
      story:
        'Click the "Apply" button to see the loading state. ' +
        'The button text changes to "Applying..." and becomes disabled during the save operation.',
    },
  },
};

/**
 * Demonstrates appearance save error state.
 * To see the error message in action:
 * 1. Manually type an invalid color value (e.g., "invalid-color", "###", "badrgb()")
 * 2. Click the "Apply" button
 * 3. An error message will appear: "Accent color format is invalid..."
 *
 * This story shows the component ready for error demonstration.
 */
export const AppearanceSaveError: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: '',
    allowedNamespaces: [],
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

AppearanceSaveError.parameters = {
  docs: {
    description: {
      story:
        'Try entering invalid color formats to see validation errors: ' +
        'Examples of invalid formats: "xyz", "notacolor", "###", "rgb(999,999,999)". ' +
        'Valid formats include: hex (#ff0000), rgb(255,0,0), rgba(255,0,0,0.5), or CSS color names (red, blue).',
    },
  },
};

/**
 * Demonstrates appearance save success state.
 * Shows the form after successfully applying appearance changes.
 */
export const AppearanceSaveSuccess: StoryFn = () => {
  setupLocalStorage(mockClusterName, {
    defaultNamespace: 'my-app',
    allowedNamespaces: ['default', 'my-app'],
    appearance: {
      accentColor: '#4caf50',
      icon: 'mdi:check-circle',
    },
  });

  return (
    <TestContext store={getMockStore(mockClusters)} urlSearchParams={{ c: mockClusterName }}>
      <SettingsCluster />
    </TestContext>
  );
};

// Add documentation note for AppearanceSaveSuccess
AppearanceSaveSuccess.parameters = {
  docs: {
    description: {
      story:
        'This story shows the component state after a successful save. ' +
        'The appearance settings (green color and check icon) have been applied. ' +
        'Note: The component does not show an explicit success message; ' +
        'success is indicated by the settings being persisted and the button returning to "Apply" state.',
    },
  },
};

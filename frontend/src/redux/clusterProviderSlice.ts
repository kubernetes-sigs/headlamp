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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import type { ApiError } from '../lib/k8s/api/v2/ApiError';

export interface DialogProps {
  cluster: any;
  openConfirmDialog: string;
  setOpenConfirmDialog: (value: string) => void;
}

export interface MenuItemProps {
  cluster: any;
  handleMenuClose: () => void;
  setOpenConfirmDialog: (value: string) => void;
}

export interface ClusterStatusProps {
  cluster: any;
  error: ApiError | null | undefined;
}

/** Props passed to a custom Home page cluster empty-state component. */
export interface ClusterEmptyStateProps {
  /** Headlamp's standard empty state, for products that want to wrap rather than replace it. */
  defaultContent: ReactNode;
}

export type DialogComponent = (props: DialogProps) => React.ReactElement | null;
export type MenuItemComponent = (props: MenuItemProps) => React.ReactElement | null;
export type ClusterStatusComponent = (props: ClusterStatusProps) => React.ReactElement | null;
/** A component that replaces or wraps the Home page cluster empty state. */
export type ClusterEmptyStateComponent = (
  props: ClusterEmptyStateProps
) => React.ReactElement | null;

/**
 * Information about a cluster provider, that is shown on the add cluster page.
 */
export interface ClusterProviderInfo {
  /** The title of the provider. */
  title: string;
  /** An icon component, an imported SVG. */
  icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
  /** Description of the provider. Explaining a bit about what it is. */
  description: string;
  /** Url for where the Add button should go to. */
  url: string;
}

/**
 * A plugin's claim on the Delete action of the clusters it manages.
 *
 * For a cluster that `owns` returns true for, the Delete item in the Home page's
 * cluster action menu opens the plugin's dialog named `dialog` (registered with
 * `registerClusterProviderDialog`) instead of removing the cluster from the
 * kubeconfig.
 */
export interface ClusterDeleteHandler {
  /** Whether the plugin handles Delete for this cluster entry. */
  owns: (cluster: any) => boolean;
  /**
   * The `openConfirmDialog` value that opens the plugin's delete dialog. It must not be empty or
   * `deleteDynamic` (`BUILT_IN_DELETE_DIALOG`), the name of Headlamp's own confirmation.
   */
  dialog: string;
}

/** The `openConfirmDialog` value of Headlamp's own Delete confirmation in the cluster action menu. */
export const BUILT_IN_DELETE_DIALOG = 'deleteDynamic';

/**
 * Whether a delete handler may use `dialog`: an empty name opens nothing, and the built-in name
 * would also open Headlamp's confirmation, which only removes the cluster from the kubeconfig.
 */
export function isPluginDeleteDialog(dialog: unknown): dialog is string {
  return typeof dialog === 'string' && dialog !== '' && dialog !== BUILT_IN_DELETE_DIALOG;
}

export interface ClusterProviderSliceState {
  /** Dialog components that can be rendered by the application, on the Home. */
  dialogs: DialogComponent[];
  /** Menu items that can be rendered by the application, on the Home page in the cluster action menu. */
  menuItems: MenuItemComponent[];
  /** Plugins that handle Delete in the cluster action menu, in registration order. */
  deleteHandlers: ClusterDeleteHandler[];
  /** Cluster providers for the Add Cluster page. */
  clusterProviders: ClusterProviderInfo[];
  /** Cluster statuses for the Home page. */
  clusterStatuses: ClusterStatusComponent[];
  /** Optional product-owned replacement for the Home page's empty cluster state. */
  clusterEmptyState: ClusterEmptyStateComponent | null;
}

export const initialState: ClusterProviderSliceState = {
  menuItems: [],
  dialogs: [],
  deleteHandlers: [],
  clusterProviders: [],
  clusterStatuses: [],
  clusterEmptyState: null,
};

const clusterProviderSlice = createSlice({
  name: 'clusterProviderSlice',
  initialState,
  reducers: {
    addDialog(state, action: PayloadAction<DialogComponent>) {
      state.dialogs.push(action.payload);
    },
    addMenuItem(state, action: PayloadAction<MenuItemComponent>) {
      state.menuItems.push(action.payload);
    },
    addDeleteHandler(state, action: PayloadAction<ClusterDeleteHandler>) {
      state.deleteHandlers.push(action.payload);
    },
    addAddClusterProvider(state, action: PayloadAction<ClusterProviderInfo>) {
      state.clusterProviders.push(action.payload);
    },
    addClusterStatus(state, action: PayloadAction<ClusterStatusComponent>) {
      state.clusterStatuses.push(action.payload);
    },
    setClusterEmptyState(state, action: PayloadAction<ClusterEmptyStateComponent>) {
      state.clusterEmptyState = action.payload;
    },
  },
});

export const {
  addDialog,
  addMenuItem,
  addDeleteHandler,
  addAddClusterProvider,
  addClusterStatus,
  setClusterEmptyState,
} = clusterProviderSlice.actions;

export default clusterProviderSlice.reducer;

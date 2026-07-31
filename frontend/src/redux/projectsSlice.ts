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

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import type { ButtonStyle } from '../components/common/ActionButton/ActionButton';
import type { ApiResource } from '../lib/k8s/api/v2/ApiResource';
import { apiResourceId } from '../lib/k8s/api/v2/ApiResource';
import type { KubeObject } from '../lib/k8s/KubeObject';

/** A project entry assembled from one or more Kubernetes namespaces. */
export interface ProjectDefinition {
  /** Project ID read from the `headlamp.dev/project-id` namespace label. */
  id: string;
  /** Opaque grouping key used when one project ID represents multiple project entries. */
  key?: string;
  /** Namespaces included in the project entry. */
  namespaces: string[];
  /** Clusters containing the project entry's namespaces. */
  clusters: string[];
  /** Exact namespace and cluster pairs included in the project entry. */
  namespaceRefs?: ProjectNamespaceReference[];
}

/** Identifies one Kubernetes namespace within a specific Headlamp cluster. */
export interface ProjectNamespaceReference {
  /** Kubernetes namespace name. */
  name: string;
  /** Headlamp cluster name containing the namespace. */
  cluster: string;
}

/** Namespace data available to a custom project grouping callback. */
export interface ProjectNamespace {
  /** Kubernetes namespace metadata used for grouping. */
  metadata: {
    /** Kubernetes namespace name. */
    name: string;
    /** Kubernetes namespace labels, when present. */
    labels?: Record<string, string>;
  };
  /** Headlamp cluster name containing the namespace. */
  cluster: string;
}

/** Parameters passed to a custom project grouping callback. */
export interface ProjectGroupingParams {
  /** Namespace being assigned to a project entry. */
  namespace: ProjectNamespace;
  /** Project ID read from the namespace label. */
  projectId: string;
}

/** Custom behavior for grouping project namespaces into separate entries. */
export interface ProjectGrouping {
  /**
   * Return an opaque key for grouping a namespace into a project entry.
   * The project ID is used when the returned key is empty.
   *
   * @param params - Namespace and labelled project ID to group.
   * @returns An opaque grouping key.
   */
  getProjectKey: (params: ProjectGroupingParams) => string;
}

/** Define custom way to create new Projects */
export interface CustomCreateProject {
  id: string;
  name: string;
  description: string;
  icon: string | (() => ReactNode);
  component: ({
    onBack,
  }: {
    /** Callback for going to the previous screen */
    onBack: () => void;
  }) => ReactNode;
}

/**
 * Custom section for the project overview tab
 */
export interface ProjectOverviewSection {
  /** Unique identifier for the section registration. */
  id: string;
  /**
   * Component rendered in the project overview.
   *
   * @param props - Properties supplied to the section component.
   * @param props.project - Project currently displayed.
   * @param props.projectResources - Kubernetes resources loaded for the project.
   * @returns Content to render in the section.
   */
  component: (props: { project: ProjectDefinition; projectResources: KubeObject[] }) => ReactNode;
  /**
   * Determines whether the section is displayed for a project.
   *
   * The section is displayed by default when this function is omitted. Rejected promises and
   * synchronous errors are treated as `false`.
   *
   * @param params - Section enablement context.
   * @param params.project - Project being evaluated.
   * @returns A promise resolving to `true` when the section should be displayed.
   */
  isEnabled?: ({ project }: { project: ProjectDefinition }) => Promise<boolean>;
}

export interface ProjectDetailsTab {
  id: string;
  label?: ReactNode;
  icon: string | ReactNode;
  component?: (props: { project: ProjectDefinition; projectResources: KubeObject[] }) => ReactNode;
  /** Function to check if this tab be displayed in the given project. If not provided the Tab will be enabled. */
  isEnabled?: ({ project }: { project: ProjectDefinition }) => Promise<boolean>;
}

export interface ProjectDeleteButton {
  isEnabled?: (params: { project: ProjectDefinition }) => Promise<boolean>;
  component: (props: { project: ProjectDefinition; buttonStyle?: ButtonStyle }) => ReactNode;
}

export interface ProjectHeaderAction {
  id: string;
  component: (props: {
    project: ProjectDefinition;
    setSelectedTab?: (tabId: string) => void;
  }) => ReactNode;
  /** Function to check if this action should be displayed in the given project. If not provided the action will be enabled. */
  isEnabled?: ({ project }: { project: ProjectDefinition }) => Promise<boolean>;
}

export interface ProjectsState {
  customCreateProject: Record<string, CustomCreateProject>;
  /** Plugin-provided project grouping behavior. */
  projectGrouping?: ProjectGrouping;
  overviewSections: Record<string, ProjectOverviewSection>;
  detailsTabs: Record<string, ProjectDetailsTab>;
  projectDeleteButton?: ProjectDeleteButton;
  headerActions: Record<string, ProjectHeaderAction>;
  /** Plugin-registered API resources for project resource fetching */
  apiResources: ApiResource[];
}

const initialState: ProjectsState = {
  customCreateProject: {},
  detailsTabs: {},
  overviewSections: {},
  headerActions: {},
  apiResources: [],
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    /** Register custom project create popup, for plugins */
    addCustomCreateProject(state, action: PayloadAction<CustomCreateProject>) {
      state.customCreateProject[action.payload.id] = action.payload;
    },

    /** Set custom project grouping behavior. */
    setProjectGrouping(state, action: PayloadAction<ProjectGrouping>) {
      state.projectGrouping = action.payload;
    },

    /** Register additional tab for project details page */
    addDetailsTab(state, action: PayloadAction<ProjectDetailsTab>) {
      state.detailsTabs[action.payload.id] = action.payload;
    },

    /** Register additional section to the overview page */
    addOverviewSection(state, action: PayloadAction<ProjectOverviewSection>) {
      state.overviewSections[action.payload.id] = action.payload;
    },

    /** Override default delete button */
    setProjectDeleteButton(state, action: PayloadAction<ProjectDeleteButton>) {
      state.projectDeleteButton = action.payload;
    },

    /** Register additional action button for project header */
    addHeaderAction(state, action: PayloadAction<ProjectHeaderAction>) {
      state.headerActions[action.payload.id] = action.payload;
    },

    /** Register additional API resource for project resource fetching */
    addProjectApiResource(state, action: PayloadAction<ApiResource>) {
      const id = apiResourceId(action.payload);
      const exists = state.apiResources.some(r => apiResourceId(r) === id);
      if (!exists) {
        state.apiResources.push(action.payload);
      }
    },
  },
});

export const {
  addCustomCreateProject,
  setProjectGrouping,
  addDetailsTab,
  addOverviewSection,
  setProjectDeleteButton,
  addHeaderAction,
  addProjectApiResource,
} = projectsSlice.actions;

export default projectsSlice.reducer;

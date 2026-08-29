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

export interface ProjectDefinition {
  id: string;
  namespaces: string[];
  clusters: string[];
}

/** IDs plugins can register to replace Headlamp's built-in project creation options. */
export const DefaultCreateProject = {
  /** Replace the built-in project form that uses existing or new namespaces. */
  NEW_PROJECT: 'headlamp.projects.new-project',
  /** Replace the built-in YAML project creation flow. */
  FROM_YAML: 'headlamp.projects.from-yaml',
} as const;

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
   * Return `null` when the section has nothing to show: the surrounding card is then hidden so no
   * blank space is left behind. Returning a wrapper element that renders no visible content keeps
   * the card on screen.
   *
   * @param props - Properties supplied to the section component.
   * @param props.project - Project currently displayed.
   * @param props.projectResources - Kubernetes resources loaded for the project.
   * @returns Content to render in the section, or `null` to hide it.
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
  addDetailsTab,
  addOverviewSection,
  setProjectDeleteButton,
  addHeaderAction,
  addProjectApiResource,
} = projectsSlice.actions;

export default projectsSlice.reducer;

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
import type { KubeObject } from '../lib/k8s/KubeObject';

export interface ProjectDefinition {
  id: string;
  namespaces: string[];
  clusters: string[];
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
  id: string;
  component: (props: { project: ProjectDefinition; projectResources: KubeObject[] }) => ReactNode;
}

export interface ProjectDetailsTab {
  id: string;
  label?: ReactNode;
  icon: string | ReactNode;
  component?: (props: { project: ProjectDefinition; projectResources: KubeObject[] }) => ReactNode;
}

export interface ProjectDeleteButton {
  isEnabled?: (params: { project: ProjectDefinition }) => Promise<boolean>;
  component: (props: { project: ProjectDefinition; buttonStyle?: ButtonStyle }) => ReactNode;
}

export interface ProjectsState {
  customCreateProject: Record<string, CustomCreateProject>;
  overviewSections: Record<string, ProjectOverviewSection>;
  detailsTabs: Record<string, ProjectDetailsTab>;
  projectDeleteButton?: ProjectDeleteButton;
}

const initialState: ProjectsState = {
  customCreateProject: {},
  detailsTabs: {},
  overviewSections: {},
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
  },
});

export const { addCustomCreateProject, addDetailsTab, addOverviewSection, setProjectDeleteButton } =
  projectsSlice.actions;

export default projectsSlice.reducer;

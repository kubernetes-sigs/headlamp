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
import { ReactNode } from 'react';
import { KubeObject } from '../lib/k8s/KubeObject';

export interface ProjectDefinition {
  id: string;
  namespaces: string[];
  clusters: string[];
}

export type ProjectListProcessorFunction = (
  currentProjects: ProjectDefinition[]
) => ProjectDefinition[];

export interface ProjectListProcessor {
  id?: string;
  processor: ProjectListProcessorFunction;
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
  label: string;
  icon?: string | ReactNode;
  component: (props: { project: ProjectDefinition; projectResources: KubeObject[] }) => ReactNode;
}

export interface ProjectsState {
  customCreateProject: Record<string, CustomCreateProject>;
  overviewSections: Record<string, ProjectOverviewSection>;
  detailsTabs: Record<string, ProjectDetailsTab>;
  projectListProcessors: ProjectListProcessor[];
}

const initialState: ProjectsState = {
  customCreateProject: {},
  detailsTabs: {},
  overviewSections: {},
  projectListProcessors: [],
};

/**
 * Normalizes a project list processor by ensuring it has an 'id' and a processor function.
 */
function _normalizeProjectListProcessor(
  action: PayloadAction<ProjectListProcessor | ProjectListProcessorFunction>
): ProjectListProcessor {
  let processor: ProjectListProcessor = action.payload as ProjectListProcessor;
  if (typeof action.payload === 'function') {
    processor = {
      id: `generated-id-${Date.now().toString(36)}`,
      processor: action.payload,
    };
  }

  if (!processor.id) {
    processor.id = `generated-id-${Date.now().toString(36)}`;
  }

  return processor;
}

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

    /** Register a project list processor */
    addProjectListProcessor(
      state,
      action: PayloadAction<ProjectListProcessor | ProjectListProcessorFunction>
    ) {
      state.projectListProcessors.push(_normalizeProjectListProcessor(action));
    },
  },
});

export const {
  addCustomCreateProject,
  addDetailsTab,
  addOverviewSection,
  addProjectListProcessor,
} = projectsSlice.actions;

export default projectsSlice.reducer;

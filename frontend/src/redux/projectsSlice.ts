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
import { defaultApiResources } from '../components/project/projectUtils';
import { ApiResource } from '../lib/k8s/api/v2/ApiResource';
import { KubeObject } from '../lib/k8s/KubeObject';

export interface StringSelector {
  operator: 'Equals' | 'NotEquals';
  value: string;
}

/** Project is a collection of kubernetes resources, grouped by namespace and or labels */
export interface ProjectDefinition {
  /** Unique ID */
  id: string;
  /** Name of the project */
  name: string;
  description?: string;
  /** Icon color */
  color?: string;
  icon?: string;

  // Selection criteria
  labelSelectors: Record<string, StringSelector>;
  namespaceSelectors: StringSelector[];
  clusterSelectors: StringSelector[];
  apiResources: ApiResource[];

  // Metadata
  createdAt: string;
  updatedAt: string;
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
  icon: string | ReactNode;
  component: (props: { project: ProjectDefinition; projectResources: KubeObject[] }) => ReactNode;
}

export interface ProjectsState {
  projects: { [projectId: string]: ProjectDefinition };
  customCreateProject: Record<string, CustomCreateProject>;
  overviewSections: Record<string, ProjectOverviewSection>;
  detailsTabs: Record<string, ProjectDetailsTab>;
}

const PROJECTS_STORAGE_KEY = 'headlamp-projects';

// Load projects from localStorage
function loadProjectsFromStorage(): ProjectsState['projects'] {
  try {
    const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error loading projects from localStorage:', error);
    return {};
  }
}

// Save projects to localStorage
function saveProjectsToStorage(projects: ProjectsState['projects']) {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('Error saving projects to localStorage:', error);
  }
}

const initialState: ProjectsState = {
  projects: loadProjectsFromStorage(),
  customCreateProject: {},
  detailsTabs: {},
  overviewSections: {},
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    /**
     * Create or update an existing project definition
     */
    createOrUpdateProjectAction(
      state,
      action: PayloadAction<
        Omit<ProjectDefinition, 'id' | 'createdAt' | 'apiResources'> & {
          id?: string;
          createdAt?: string;
          apiResources?: ApiResource[];
        }
      >
    ) {
      const id = `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      const project = {
        ...action.payload,
        id: action.payload.id ?? id,
        createdAt: action.payload.createdAt ?? now,
        updatedAt: now,
        apiResources: action.payload.apiResources ?? defaultApiResources,
      };

      state.projects[project.id] = project;
      saveProjectsToStorage(state.projects);
    },

    /**
     * Delete a project definition
     */
    deleteProject(state, action: PayloadAction<string>) {
      delete state.projects[action.payload];
      saveProjectsToStorage(state.projects);
    },

    /**
     * Import projects (for bulk operations)
     */
    importProjects(state, action: PayloadAction<ProjectDefinition[]>) {
      action.payload.forEach(project => {
        state.projects[project.id] = project;
      });
      saveProjectsToStorage(state.projects);
    },

    /**
     * Clear all projects
     */
    clearProjects(state) {
      state.projects = {};
      saveProjectsToStorage(state.projects);
    },

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
  },
});

export const {
  createOrUpdateProjectAction,
  deleteProject,
  importProjects,
  clearProjects,
  addCustomCreateProject,
  addDetailsTab,
  addOverviewSection,
} = projectsSlice.actions;

export default projectsSlice.reducer;

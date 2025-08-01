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

export interface ProjectLabelSelector {
  key: string;
  value?: string;
  operator: 'Equals' | 'NotEquals' | 'Exists' | 'NotExists';
}

export interface ProjectNamespaceSelector {
  name: string;
}

export interface ProjectClusterSelector {
  name: string;
}

export interface ProjectDefinition {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;

  // Selection criteria
  labelSelectors: ProjectLabelSelector[];
  namespaceSelectors: ProjectNamespaceSelector[];
  clusterSelectors: ProjectClusterSelector[];

  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsState {
  projects: { [projectId: string]: ProjectDefinition };
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
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    /**
     * Create a new project definition
     */
    createProject(state, action: PayloadAction<Omit<ProjectDefinition, 'id' | 'createdAt' | 'updatedAt'>>) {
      const id = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const project: ProjectDefinition = {
        ...action.payload,
        id,
        createdAt: now,
        updatedAt: now,
      };

      state.projects[id] = project;
      saveProjectsToStorage(state.projects);
    },

    /**
     * Update an existing project definition
     */
    updateProject(state, action: PayloadAction<ProjectDefinition>) {
      const project = {
        ...action.payload,
        updatedAt: new Date().toISOString(),
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
  },
});

export const {
  createProject,
  updateProject,
  deleteProject,
  importProjects,
  clearProjects,
} = projectsSlice.actions;

export default projectsSlice.reducer;

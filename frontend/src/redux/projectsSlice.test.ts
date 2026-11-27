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

import { describe, expect, it } from 'vitest';
import type { ApiResource } from '../lib/k8s/api/v2/ApiResource';
import projectsReducer, {
  addCustomCreateProject,
  addDetailsTab,
  addHeaderAction,
  addOverviewSection,
  addProjectApiResource,
  DefaultCreateProject,
  setProjectDeleteButton,
  setProjectGrouping,
} from './projectsSlice';

const emptyState = projectsReducer(undefined, { type: 'unknown' });

const deployments: ApiResource = {
  apiVersion: 'apps/v1',
  groupName: 'apps',
  version: 'v1',
  pluralName: 'deployments',
  singularName: 'deployment',
  kind: 'Deployment',
  isNamespaced: true,
};

describe('projectsSlice', () => {
  it('starts with nothing registered', () => {
    expect(emptyState).toEqual({
      customCreateProject: {},
      detailsTabs: {},
      overviewSections: {},
      headerActions: {},
      apiResources: [],
    });
  });

  it('exposes the default create project IDs plugins can replace', () => {
    expect(DefaultCreateProject).toEqual({
      NEW_PROJECT: 'headlamp.projects.new-project',
      FROM_YAML: 'headlamp.projects.from-yaml',
    });
  });

  it('stores registered project grouping behavior', () => {
    const projectGrouping = {
      getProjectKey: ({ projectId }: { projectId: string }) => projectId,
    };

    const state = projectsReducer(undefined, setProjectGrouping(projectGrouping));

    expect(state.projectGrouping).toBe(projectGrouping);
  });

  it('replaces the project grouping when it is set again', () => {
    const first = { getProjectKey: () => 'first' };
    const second = { getProjectKey: () => 'second' };

    let state = projectsReducer(undefined, setProjectGrouping(first));
    state = projectsReducer(state, setProjectGrouping(second));

    expect(state.projectGrouping).toBe(second);
  });

  describe('addCustomCreateProject', () => {
    const option = {
      id: 'my-plugin.create',
      name: 'Create',
      description: 'Creates a project',
      icon: 'mdi:plus',
      component: () => null,
    };

    it('registers the option under its id', () => {
      const state = projectsReducer(undefined, addCustomCreateProject(option));

      expect(state.customCreateProject).toEqual({ [option.id]: option });
    });

    it('overwrites an option registered with the same id and keeps others', () => {
      const other = { ...option, id: 'other', name: 'Other' };
      const replacement = { ...option, name: 'Replacement' };

      let state = projectsReducer(undefined, addCustomCreateProject(option));
      state = projectsReducer(state, addCustomCreateProject(other));
      state = projectsReducer(state, addCustomCreateProject(replacement));

      expect(Object.keys(state.customCreateProject)).toEqual([option.id, 'other']);
      expect(state.customCreateProject[option.id].name).toBe('Replacement');
    });
  });

  describe('addDetailsTab', () => {
    it('registers the tab under its id and overwrites on re-register', () => {
      const tab = { id: 'logs', label: 'Logs', icon: 'mdi:text' };

      let state = projectsReducer(undefined, addDetailsTab(tab));
      expect(state.detailsTabs).toEqual({ logs: tab });

      const updated = { ...tab, label: 'Project logs' };
      state = projectsReducer(state, addDetailsTab(updated));
      expect(state.detailsTabs).toEqual({ logs: updated });
    });
  });

  describe('addOverviewSection', () => {
    it('registers the section under its id and overwrites on re-register', () => {
      const section = { id: 'summary', component: () => null };

      let state = projectsReducer(undefined, addOverviewSection(section));
      expect(state.overviewSections.summary).toBe(section);

      const replacement = { id: 'summary', component: () => 'new' };
      state = projectsReducer(state, addOverviewSection(replacement));
      expect(state.overviewSections.summary).toBe(replacement);
      expect(Object.keys(state.overviewSections)).toEqual(['summary']);
    });

    it('keeps the isEnabled predicate of the registered section', () => {
      const isEnabled = async () => false;

      const state = projectsReducer(
        undefined,
        addOverviewSection({ id: 'conditional', component: () => null, isEnabled })
      );

      expect(state.overviewSections.conditional.isEnabled).toBe(isEnabled);
    });
  });

  describe('setProjectDeleteButton', () => {
    it('stores the button and replaces a previous one', () => {
      const first = { component: () => null };
      const second = { component: () => null, isEnabled: async () => true };

      let state = projectsReducer(undefined, setProjectDeleteButton(first));
      expect(state.projectDeleteButton).toBe(first);

      state = projectsReducer(state, setProjectDeleteButton(second));
      expect(state.projectDeleteButton).toBe(second);
    });
  });

  describe('addHeaderAction', () => {
    it('registers the action under its id and overwrites on re-register', () => {
      const action = { id: 'open-docs', component: () => null };

      let state = projectsReducer(undefined, addHeaderAction(action));
      expect(state.headerActions).toEqual({ 'open-docs': action });

      const replacement = { id: 'open-docs', component: () => 'new' };
      state = projectsReducer(state, addHeaderAction(replacement));
      expect(state.headerActions['open-docs']).toBe(replacement);
      expect(Object.keys(state.headerActions)).toEqual(['open-docs']);
    });
  });

  describe('addProjectApiResource', () => {
    it('appends a new resource', () => {
      const state = projectsReducer(undefined, addProjectApiResource(deployments));

      expect(state.apiResources).toEqual([deployments]);
    });

    it('ignores a resource that is already registered', () => {
      let state = projectsReducer(undefined, addProjectApiResource(deployments));
      state = projectsReducer(state, addProjectApiResource({ ...deployments }));

      expect(state.apiResources).toHaveLength(1);
    });

    it('treats resources with a different group, version or plural name as distinct', () => {
      const otherGroup = { ...deployments, groupName: 'extensions' };
      const otherVersion = { ...deployments, apiVersion: 'apps/v1beta1', version: 'v1beta1' };
      const otherPlural = { ...deployments, pluralName: 'statefulsets' };

      let state = projectsReducer(undefined, addProjectApiResource(deployments));
      state = projectsReducer(state, addProjectApiResource(otherGroup));
      state = projectsReducer(state, addProjectApiResource(otherVersion));
      state = projectsReducer(state, addProjectApiResource(otherPlural));

      expect(state.apiResources).toHaveLength(4);
    });

    it('handles a core resource that has no group name', () => {
      const pods: ApiResource = {
        apiVersion: 'v1',
        version: 'v1',
        pluralName: 'pods',
        singularName: 'pod',
        kind: 'Pod',
        isNamespaced: true,
      };

      let state = projectsReducer(undefined, addProjectApiResource(pods));
      state = projectsReducer(state, addProjectApiResource(pods));

      expect(state.apiResources).toEqual([pods]);
    });
  });

  it('does not mutate the previous state', () => {
    const next = projectsReducer(emptyState, addProjectApiResource(deployments));

    expect(emptyState.apiResources).toEqual([]);
    expect(next).not.toBe(emptyState);
  });
});

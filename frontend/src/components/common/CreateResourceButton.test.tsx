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

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Activity } from '../activity/Activity';
import { CreateResourceButton } from './CreateResourceButton';

// Hoisted definitions allow mock components and spies to be initialized before vi.mock calls execute.
const { authVisibleProps, editorDialogProps, mockAuthAllowed, MockPodForm } = vi.hoisted(() => {
  // Lightweight mock form simulating resource forms registered in RESOURCE_DEFINITIONS
  const MockPodForm = (props: {
    resource: Record<string, any>;
    onChange: (newItem: Record<string, any>) => void;
    onValidChange: (valid: boolean) => void;
  }) => (
    <div data-testid="mock-pod-form">
      <span data-testid="form-resource-name">{props.resource?.metadata?.name ?? ''}</span>
      <button
        data-testid="form-change-button"
        onClick={() =>
          props.onChange({
            ...props.resource,
            metadata: { ...props.resource?.metadata, name: 'from-form' },
          })
        }
      >
        Update Form
      </button>
      <button data-testid="form-valid-true" onClick={() => props.onValidChange(true)}>
        Set Valid
      </button>
      <button data-testid="form-valid-false" onClick={() => props.onValidChange(false)}>
        Set Invalid
      </button>
    </div>
  );

  return {
    authVisibleProps: vi.fn(),
    editorDialogProps: vi.fn(),
    mockAuthAllowed: { value: true },
    MockPodForm,
  };
});

// Mock cluster selection to test default cluster fallback logic
vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: () => ['legacy', 'dra'],
}));

// Mock Activity launch and close to verify lifecycle and metadata passing
vi.mock('../activity/Activity', () => ({
  Activity: { launch: vi.fn(), close: vi.fn() },
}));

// Mock translation to preserve keys while interpolating dynamic parameters like {{ name }}
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => {
      if (options?.name) {
        return key.replace('{{ name }}', options.name);
      }
      return key;
    },
  }),
}));

// Mock AuthVisible and EditorDialog to isolate CreateResourceButton from async React Query
// RBAC calls and Monaco Editor rendering, while capturing props to verify parameter contracts.
vi.mock('../common/Resource', () => ({
  AuthVisible: (props: any) => {
    authVisibleProps(props);
    return mockAuthAllowed.value ? props.children : null;
  },
  EditorDialog: (props: any) => {
    editorDialogProps(props);
    return (
      <div
        data-testid="editor-dialog"
        data-title={props.title}
        data-form-invalid={String(props.formInvalid)}
        data-error-message={props.errorMessage}
      >
        <button data-testid="editor-dialog-close" onClick={props.onClose}>
          Close
        </button>
        <button
          data-testid="editor-dialog-change-valid"
          onClick={() =>
            props.onEditorChanged('apiVersion: v1\nkind: Pod\nmetadata:\n  name: updated-pod')
          }
        >
          Change Editor Valid
        </button>
        <button
          data-testid="editor-dialog-change-invalid"
          onClick={() => props.onEditorChanged('invalid: [yaml')}
        >
          Change Editor Invalid
        </button>
        {props.formContent}
      </div>
    );
  },
}));

// Mock RESOURCE_DEFINITIONS to avoid importing the heavy KubeObject hierarchy
// (ReplicaSet, Deployment, etc.) in CreateButton, which introduces circular imports in Vitest.
// parseEditorObject is imported directly from ./Resource/parseEditorObject without mocking.
vi.mock('./Resource/CreateButton', () => ({
  RESOURCE_DEFINITIONS: {
    Pod: {
      form: MockPodForm,
    },
  },
}));

// Test resource classes representing supported (Pod) and unsupported (ConfigMap) form kinds
const podClass = {
  kind: 'Pod',
  apiName: 'pods',
  getBaseObject: () => ({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'initial-pod' } }),
} as any;

const configMapClass = {
  kind: 'ConfigMap',
  apiName: 'configmaps',
  getBaseObject: () => ({ apiVersion: 'v1', kind: 'ConfigMap' }),
} as any;

/** Helper to render CreateResourceButton, click it, and render the resulting Activity content. */
function launchCreate(resourceClass = podClass, cluster?: string, resourceName?: string) {
  render(
    <CreateResourceButton
      resourceClass={resourceClass}
      cluster={cluster}
      resourceName={resourceName}
    />
  );
  fireEvent.click(screen.getByRole('button'));
  const activity = vi.mocked(Activity.launch).mock.calls[0][0];
  const { unmount } = render(<>{activity.content}</>);
  return { activity, unmount };
}

describe('CreateResourceButton', () => {
  beforeEach(() => {
    vi.mocked(Activity.launch).mockReset();
    vi.mocked(Activity.close).mockReset();
    authVisibleProps.mockReset();
    editorDialogProps.mockReset();
    mockAuthAllowed.value = true;
  });

  // 1. Rendering and RBAC: Verify button appearance, localized labels, and authorization gating
  describe('Rendering and RBAC', () => {
    it('renders with default localized description from kind', () => {
      render(<CreateResourceButton resourceClass={podClass} />);

      const button = screen.getByRole('button', { name: 'translation|Create Pod' });
      expect(button).toBeInTheDocument();
      expect(authVisibleProps).toHaveBeenCalledWith(
        expect.objectContaining({
          item: podClass,
          authVerb: 'create',
        })
      );
    });

    it('renders with custom resourceName when specified', () => {
      render(<CreateResourceButton resourceClass={podClass} resourceName="Worker Pod" />);

      const button = screen.getByRole('button', { name: 'translation|Create Worker Pod' });
      expect(button).toBeInTheDocument();
    });

    it('hides the button when AuthVisible denies permission', () => {
      mockAuthAllowed.value = false;
      render(<CreateResourceButton resourceClass={podClass} />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  // 2. Cluster targeting: Verify cluster fallback to selected clusters vs explicit cluster targeting
  describe('Cluster targeting', () => {
    it('creates in the first selected cluster by default', () => {
      const { activity } = launchCreate();

      expect(activity.cluster).toBe('legacy');
      expect(authVisibleProps.mock.calls[0][0].cluster).toBeUndefined();
      expect(editorDialogProps.mock.calls[0][0].cluster).toBeUndefined();
    });

    it('checks and creates in the given cluster', () => {
      const { activity } = launchCreate(podClass, 'dra');

      expect(activity.cluster).toBe('dra');
      expect(authVisibleProps.mock.calls[0][0].cluster).toBe('dra');
      expect(editorDialogProps.mock.calls[0][0].cluster).toBe('dra');
    });
  });

  // 3. Activity Lifecycle: Verify Activity panel launching metadata and dismissal cleanup
  describe('Activity Lifecycle', () => {
    it('launches Activity with full location, correct id, title, and icon', () => {
      const { activity } = launchCreate(podClass);

      expect(activity.id).toBe('create-resource-pods');
      expect(activity.title).toBe('translation|Create Pod');
      expect(activity.location).toBe('full');
      expect(activity.icon).toBeDefined();
    });

    it('closes Activity when onClose callback is triggered from editor dialog', () => {
      launchCreate(podClass);

      fireEvent.click(screen.getByTestId('editor-dialog-close'));
      expect(Activity.close).toHaveBeenCalledWith('create-resource-pods');
    });
  });

  // 4. Resource Definitions and Form Rendering: Verify dynamic form component resolution
  describe('Resource Definitions and Form Rendering', () => {
    it('renders form component when resource kind exists in RESOURCE_DEFINITIONS', () => {
      launchCreate(podClass);

      expect(screen.getByTestId('mock-pod-form')).toBeInTheDocument();
      expect(editorDialogProps.mock.calls[0][0].formContent).toBeDefined();
    });

    it('does not render form component when resource kind is not in RESOURCE_DEFINITIONS', () => {
      launchCreate(configMapClass);

      expect(screen.queryByTestId('mock-pod-form')).not.toBeInTheDocument();
      expect(editorDialogProps.mock.calls[0][0].formContent).toBeUndefined();
      expect(editorDialogProps.mock.calls[0][0].formInvalid).toBe(false);
    });

    it('passes expected configuration props to EditorDialog', () => {
      launchCreate(podClass);

      const props = editorDialogProps.mock.calls[0][0];
      expect(props.noDialog).toBe(true);
      expect(props.open).toBe(true);
      expect(props.treatItemChangesAsEdits).toBe(true);
      expect(props.saveLabel).toBe('translation|Apply');
      expect(props.title).toBe('translation|Create Pod');
      expect(props['aria-label']).toBe('translation|Create Pod');
      expect(() => props.setOpen(false)).not.toThrow();
    });
  });

  // 5. Form and Editor Synchronization: Verify two-way state synchronization and error resilience
  describe('Form and Editor Synchronization', () => {
    it('updates item state when form resource changes', () => {
      launchCreate(podClass);

      expect(screen.getByTestId('form-resource-name').textContent).toBe('initial-pod');

      fireEvent.click(screen.getByTestId('form-change-button'));

      expect(screen.getByTestId('form-resource-name').textContent).toBe('from-form');
      const lastCall = editorDialogProps.mock.calls[editorDialogProps.mock.calls.length - 1][0];
      expect(lastCall.item.metadata.name).toBe('from-form');
    });

    it('syncs form validity with EditorDialog formInvalid prop', () => {
      launchCreate(podClass);

      fireEvent.click(screen.getByTestId('form-valid-false'));
      expect(screen.getByTestId('editor-dialog').getAttribute('data-form-invalid')).toBe('true');

      fireEvent.click(screen.getByTestId('form-valid-true'));
      expect(screen.getByTestId('editor-dialog').getAttribute('data-form-invalid')).toBe('false');
    });

    it('updates form resource when editor changes with valid YAML', () => {
      launchCreate(podClass);

      fireEvent.click(screen.getByTestId('editor-dialog-change-valid'));

      expect(screen.getByTestId('form-resource-name').textContent).toBe('updated-pod');
    });

    it('preserves existing form resource when editor changes with invalid YAML', () => {
      launchCreate(podClass);

      fireEvent.click(screen.getByTestId('form-change-button'));
      expect(screen.getByTestId('form-resource-name').textContent).toBe('from-form');

      fireEvent.click(screen.getByTestId('editor-dialog-change-invalid'));
      expect(screen.getByTestId('form-resource-name').textContent).toBe('from-form');
    });
  });
});

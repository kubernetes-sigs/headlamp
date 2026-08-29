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
import { vi } from 'vitest';

const { mockUseTypedSelector } = vi.hoisted(() => ({
  mockUseTypedSelector: vi.fn(),
}));

vi.mock('../../lib/k8s/KubeObject', () => ({
  KubeObject: class MockKubeObject {},
}));
vi.mock('../../lib/k8s/namespace', () => ({
  __esModule: true,
  default: { useList: vi.fn().mockReturnValue({ items: [] }) },
}));
vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply: vi.fn() }));
vi.mock('../../lib/k8s', () => ({ useClustersConf: vi.fn().mockReturnValue({}) }));
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...(actual as object),
    useHistory: () => ({ push: vi.fn() }),
  };
});
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual('react-i18next');
  return {
    ...(actual as object),
    useTranslation: () => ({ t: (key: string) => key }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: mockUseTypedSelector,
}));
vi.mock('@iconify/react', () => ({
  Icon: () => <span />,
}));

import { DefaultCreateProject } from '../../redux/projectsSlice';
import { TestContext } from '../../test';
import { NewProjectPopup } from './NewProjectPopup';

describe('NewProjectPopup replacements', () => {
  test.each([
    [DefaultCreateProject.NEW_PROJECT, 'New Project'],
    [DefaultCreateProject.FROM_YAML, 'New Project from YAML'],
  ])('lets a plugin replace the %s option in place', (id, builtInLabel) => {
    const CustomProject = () => <div>Custom project content</div>;
    mockUseTypedSelector.mockReturnValue({
      [id]: {
        id,
        name: 'Managed project',
        description: 'Create a managed project',
        icon: 'mdi:folder-star',
        component: CustomProject,
      },
    });

    render(
      <TestContext>
        <NewProjectPopup open onClose={vi.fn()} />
      </TestContext>
    );

    expect(screen.queryByText(builtInLabel)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Managed project'));
    expect(screen.getByText('Custom project content')).toBeInTheDocument();
    expect(screen.queryByText('Create new project')).not.toBeInTheDocument();
  });
});

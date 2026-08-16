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
import { vi } from 'vitest';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { ResourceCategory } from '../../lib/k8s/ResourceCategory';
import { TestContext } from '../../test';
import { ProjectResourcesTab } from './ProjectResourcesTab';
import { ResourceCategoriesList } from './ResourceCategoriesList';

const category: ResourceCategory = {
  label: 'Workloads',
  icon: 'mdi:circle-slice-2',
  description: 'Applications and compute resources',
};

describe('ProjectResourcesTab layout', () => {
  it('keeps the resource grid tall enough to remain visible', () => {
    const { container } = render(
      <TestContext>
        <ProjectResourcesTab projectResources={[]} setSelectedCategoryName={() => {}} />
      </TestContext>
    );

    expect(container.firstElementChild).toHaveStyle({ minHeight: '300px' });
  });
});

describe('ResourceCategoriesList', () => {
  it('shows every health state and selects a category', () => {
    const onCategoryClick = vi.fn();
    const categories = [
      {
        category: { ...category, label: 'Errors' },
        items: [{} as KubeObject],
        health: { error: 1, warning: 0, success: 0 },
      },
      {
        category: { ...category, label: 'Warnings' },
        items: [{} as KubeObject],
        health: { error: 0, warning: 1, success: 0 },
      },
      {
        category: { ...category, label: 'Healthy' },
        items: [{} as KubeObject],
        health: { error: 0, warning: 0, success: 1 },
      },
      {
        category: { ...category, label: 'Empty' },
        items: [],
        health: { error: 0, warning: 0, success: 0 },
      },
    ];

    render(
      <TestContext>
        <ResourceCategoriesList
          categoryList={categories}
          selectedCategoryName="Warnings"
          onCategoryClick={onCategoryClick}
        />
      </TestContext>
    );

    expect(screen.getByRole('button', { name: /Warnings/ })).toHaveClass('Mui-selected');
    expect(screen.getAllByText('1')).toHaveLength(3);
    expect(screen.getByText('0')).toHaveStyle({ color: 'rgba(0, 0, 0, 0.87)' });

    fireEvent.click(screen.getByRole('button', { name: /Healthy/ }));
    expect(onCategoryClick).toHaveBeenCalledWith('Healthy');
  });

  it('limits category height on narrow screens', () => {
    const { container } = render(
      <TestContext>
        <ResourceCategoriesList
          categoryList={[]}
          selectedCategoryName={undefined}
          onCategoryClick={() => {}}
        />
      </TestContext>
    );
    const categoryContainer = container.firstElementChild;
    const generatedCss = Array.from(document.styleSheets)
      .flatMap(styleSheet => Array.from(styleSheet.cssRules))
      .map(rule => rule.cssText)
      .join('\n');

    expect(categoryContainer).toHaveStyle({ flexShrink: '0' });
    expect(generatedCss).toContain('max-height: 200px');
    expect(generatedCss).toContain('overflow-y: auto');
  });
});

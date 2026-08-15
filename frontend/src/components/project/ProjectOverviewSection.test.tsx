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

import { render, screen } from '@testing-library/react';
import { TestContext } from '../../test';
import { ProjectOverviewSection } from './ProjectOverviewSection';

const project = {
  id: 'project-1',
  namespaces: ['namespace-1'],
  clusters: ['cluster-1'],
};

describe('ProjectOverviewSection', () => {
  it('renders plugin section content', () => {
    render(
      <TestContext>
        <ProjectOverviewSection
          project={project}
          projectResources={[]}
          section={{
            id: 'populated-section',
            component: () => <div>Plugin section content</div>,
          }}
        />
      </TestContext>
    );

    expect(screen.getByText('Plugin section content')).toBeVisible();
  });

  it('renders an empty card when the plugin section returns null', () => {
    const { container } = render(
      <TestContext>
        <ProjectOverviewSection
          project={project}
          projectResources={[]}
          section={{ id: 'empty-section', component: () => null }}
        />
      </TestContext>
    );

    expect(container.querySelector('.MuiCardContent-root')).toBeEmptyDOMElement();
  });
});

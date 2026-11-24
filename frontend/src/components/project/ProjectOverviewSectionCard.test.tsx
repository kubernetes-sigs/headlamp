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

import { Box, Card, CardContent, cardContentClasses, gridClasses } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { TestContext } from '../../test';
import { ProjectOverviewSectionCard } from './ProjectOverviewSectionCard';

const project = {
  id: 'project-1',
  namespaces: ['namespace-1'],
  clusters: ['cluster-1'],
};

describe('ProjectOverviewSectionCard', () => {
  it('renders plugin section content', () => {
    render(
      <TestContext>
        <ProjectOverviewSectionCard
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

  it('hides an empty card when the plugin section returns null', () => {
    const { container } = render(
      <TestContext>
        <ProjectOverviewSectionCard
          project={project}
          projectResources={[]}
          section={{ id: 'empty-section', component: () => null }}
        />
      </TestContext>
    );

    const emptyCardContent = container.querySelector(`.${cardContentClasses.root}`);
    expect(emptyCardContent).toBeEmptyDOMElement();
    expect(emptyCardContent?.closest(`.${gridClasses.item}`)).toHaveStyle({ display: 'none' });
  });

  it('keeps the card visible when the plugin section renders an empty wrapper', () => {
    const items: string[] = [];
    const { container } = render(
      <TestContext>
        <ProjectOverviewSectionCard
          project={project}
          projectResources={[]}
          section={{
            id: 'empty-wrapper-section',
            component: () => <Box>{items.map(item => item)}</Box>,
          }}
        />
      </TestContext>
    );

    // Sections must return null to be hidden; a wrapper element keeps the card on screen.
    expect(container.querySelector(`.${gridClasses.item}`)).not.toHaveStyle({ display: 'none' });
  });

  it('shows content when a plugin renders an empty nested card', () => {
    render(
      <TestContext>
        <ProjectOverviewSectionCard
          project={project}
          projectResources={[]}
          section={{
            id: 'nested-empty-card',
            component: () => (
              <>
                <div>Plugin section content</div>
                <Card>
                  <CardContent />
                </Card>
              </>
            ),
          }}
        />
      </TestContext>
    );

    expect(
      screen.getByText('Plugin section content').closest(`.${gridClasses.item}`)
    ).toBeVisible();
  });

  it('hides the card and keeps rendering when the plugin section throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <TestContext>
        <ProjectOverviewSectionCard
          project={project}
          projectResources={[]}
          section={{
            id: 'throwing-section',
            component: () => {
              throw new Error('Plugin section failure');
            },
          }}
        />
      </TestContext>
    );

    expect(container.querySelector(`.${cardContentClasses.root}`)).toBeEmptyDOMElement();
    expect(container.querySelector(`.${gridClasses.item}`)).toHaveStyle({ display: 'none' });
  });
});

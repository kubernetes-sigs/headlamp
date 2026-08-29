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

import { Card, cardClasses, CardContent, cardContentClasses, Grid } from '@mui/material';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import type { ProjectDefinition, ProjectOverviewSection } from '../../redux/projectsSlice';
import ErrorBoundary from '../common/ErrorBoundary';

/** Props for a plugin-provided project overview section card. */
interface ProjectOverviewSectionCardProps {
  /** Project displayed by the overview page. */
  project: ProjectDefinition;
  /** Kubernetes resources associated with the project. */
  projectResources: KubeObject[];
  /** Plugin section definition to render. */
  section: ProjectOverviewSection;
}

/**
 * Render a plugin-provided project overview section in the standard card layout.
 *
 * The card is hidden when the section renders nothing, so a section returning `null` does not
 * leave blank space behind. A section that throws is caught by the error boundary and, since the
 * boundary renders nothing, ends up hidden by the same rule.
 */
export function ProjectOverviewSectionCard({
  project,
  projectResources,
  section,
}: ProjectOverviewSectionCardProps) {
  return (
    <Grid
      item
      xs={12}
      md={4}
      data-testid={`project-overview-section-${section.id}`}
      sx={{
        [`&:has(> .${cardClasses.root} > .${cardContentClasses.root}:empty)`]: { display: 'none' },
      }}
    >
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <ErrorBoundary>
            <section.component project={project} projectResources={projectResources} />
          </ErrorBoundary>
        </CardContent>
      </Card>
    </Grid>
  );
}

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

import { Card, CardContent, Grid } from '@mui/material';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import type {
  ProjectDefinition,
  ProjectOverviewSection as ProjectOverviewSectionDefinition,
} from '../../redux/projectsSlice';

/** Props for a plugin-provided project overview section card. */
interface ProjectOverviewSectionProps {
  /** Project displayed by the overview page. */
  project: ProjectDefinition;
  /** Kubernetes resources associated with the project. */
  projectResources: KubeObject[];
  /** Plugin section definition to render. */
  section: ProjectOverviewSectionDefinition;
}

/** Render a plugin-provided project overview section in the standard card layout. */
export function ProjectOverviewSection({
  project,
  projectResources,
  section,
}: ProjectOverviewSectionProps) {
  return (
    <Grid item xs={12} md={4}>
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <section.component project={project} projectResources={projectResources} />
        </CardContent>
      </Card>
    </Grid>
  );
}

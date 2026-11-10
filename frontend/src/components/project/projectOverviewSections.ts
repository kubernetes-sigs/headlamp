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

import { ProjectDefinition, ProjectOverviewSection } from '../../redux/projectsSlice';

/**
 * Resolve the project overview sections that are enabled for a project.
 *
 * Sections without an `isEnabled` predicate are enabled by default. A section is omitted when its
 * predicate returns `false`, rejects, or throws. Predicate failures are logged without preventing
 * the remaining sections from being evaluated.
 *
 * @param sections - Project overview section registrations to evaluate.
 * @param project - Project passed to each section's `isEnabled` predicate.
 * @returns The sections enabled for the project, in registration order.
 */
export async function getEnabledProjectOverviewSections(
  sections: ProjectOverviewSection[],
  project: ProjectDefinition
): Promise<ProjectOverviewSection[]> {
  const enabledSections = await Promise.all(
    sections.map(section =>
      section.isEnabled
        ? Promise.resolve()
            .then(() => section.isEnabled!({ project }))
            .then(isEnabled => (isEnabled ? section : undefined))
            .catch(error => {
              console.error('Failed to check if section is enabled', section, error);
              return undefined;
            })
        : Promise.resolve(section)
    )
  );

  return enabledSections.filter(
    (section): section is ProjectOverviewSection => section !== undefined
  );
}

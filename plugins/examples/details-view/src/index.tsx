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

import {
  DefaultDetailsViewSection,
  DetailsViewDefaultHeaderActions,
  DetailsViewSectionProps,
  registerDetailsViewHeaderAction,
  registerDetailsViewHeaderActionsProcessor,
  registerDetailsViewSection,
  registerDetailsViewSectionsProcessor,
} from '@kinvolk/headlamp-plugin/lib';
import { ActionButton, SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';

function IconAction() {
  return (
    <ActionButton
      description="Our action button"
      icon="mdi:comment-quote"
      onClick={() => console.log('Hello from IconAction!')}
    />
  );
}
registerDetailsViewHeaderAction(IconAction);

// We can replace the section view with our own custom one.
// Here we are showing a custom view when it's a ConfigMap resource.

registerDetailsViewSection(({ resource }: DetailsViewSectionProps) => {
  if (resource && resource.kind === 'ConfigMap') {
    return (
      <SectionBox title="A custom very fine section title">
        The body of our custom Section for {resource.kind}
      </SectionBox>
    );
  }
  return null;
});

registerDetailsViewSectionsProcessor(function addSubheaderSection(resource, sections) {
  // Ignore if there is no resource.
  if (!resource) {
    return sections;
  }

  // Check if we already have added our custom section (this function may be called multiple times).
  const customSectionId = 'my-custom-section';
  const isCustomSectionId =
    sections.findIndex(section => {
      return (
        typeof section === 'object' &&
        section !== null &&
        'id' in section &&
        section.id === customSectionId
      );
    }) !== -1;
  if (isCustomSectionId) {
    return sections;
  }

  const detailsHeaderIdx = sections.findIndex(section => {
    return (
      typeof section === 'object' &&
      section !== null &&
      'id' in section &&
      section.id === DefaultDetailsViewSection.MAIN_HEADER
    );
  });
  const isNoMainHeader = detailsHeaderIdx === -1;
  if (isNoMainHeader) {
    // There is no header, so we do nothing.
    return sections;
  }

  // We place our custom section after the header.
  sections.splice(detailsHeaderIdx + 1, 0, {
    id: 'my-custom-section',
    section: (
      <SectionBox title={`${resource.kind}: ${resource.getName()}`}>
        A custom very fine section title
      </SectionBox>
    ),
  });

  return sections;
});

// We can replace action buttons with our own custom ones.

registerDetailsViewHeaderActionsProcessor(function replaceDeleteAction(resource, actions) {
  if (!resource || !actions.find(action => action.id === DetailsViewDefaultHeaderActions.DELETE)) {
    // There was no delete button so we do nothing.
    return actions;
  }

  const actionsDeleteRemoved = actions.filter(
    action => action.id !== DetailsViewDefaultHeaderActions.DELETE
  );
  // DetailsViewDefaultHeaderActions includes DELETE, EDIT, RESTART, SCALE, and more.

  // We add our own button as an example to show how we can replace default buttons.
  const actionsWithOurDelete = [
    ...actionsDeleteRemoved,
    {
      id: 'my-custom-delete-action',
      action: (
        <ActionButton
          description="Useless button from a plugin example from details-view example plugin"
          icon="mdi:delete"
          onClick={() => alert(`One cannot simply delete a ${resource.kind}!`)}
        />
      ),
    },
  ];
  return actionsWithOurDelete;
});

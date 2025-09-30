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

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Namespace from '../../lib/k8s/namespace';
import { ProjectDefinition } from '../../redux/projectsSlice';
import ActionButton, { ButtonStyle } from '../common/ActionButton';
import AuthVisible from '../common/Resource/AuthVisible';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';

interface ProjectDeleteButtonProps {
  project: ProjectDefinition;
  buttonStyle?: ButtonStyle;
}

export function ProjectDeleteButton({ project, buttonStyle }: ProjectDeleteButtonProps) {
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = useState(false);
  const [namespaces] = Namespace.useList({ clusters: project.clusters });

  const projectNamespaces =
    namespaces?.filter(ns => project.namespaces.includes(ns.metadata.name)) ?? [];

  // Don't show the button if there are no namespaces for this project
  if (projectNamespaces.length === 0) {
    return null;
  }

  return (
    <AuthVisible item={projectNamespaces[0]} authVerb="update">
      <ActionButton
        description={t('Delete project')}
        buttonStyle={buttonStyle}
        onClick={() => setOpenDialog(true)}
        icon="mdi:delete"
      />
      <ProjectDeleteDialog
        open={openDialog}
        project={project}
        onClose={() => setOpenDialog(false)}
        namespaces={projectNamespaces}
      />
    </AuthVisible>
  );
}

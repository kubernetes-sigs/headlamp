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

import { useQueries } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Namespace from '../../lib/k8s/namespace';
import { ProjectDefinition } from '../../redux/projectsSlice';
import ActionButton, { ButtonStyle } from '../common/ActionButton';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';

interface ProjectDeleteButtonProps {
  project: ProjectDefinition;
  buttonStyle?: ButtonStyle;
}

function useAllNamespacesAuthorized(
  namespaces: Namespace[],
  authVerb: 'update' | 'delete',
  enabled = true
) {
  const authQueries = useQueries({
    queries: namespaces.map(namespace => ({
      queryKey: ['projectDelete:auth', authVerb, namespace.cluster, namespace.metadata.name],
      queryFn: () => namespace.getAuthorization(authVerb),
      enabled,
    })),
  });

  return {
    allAuthorized:
      enabled &&
      namespaces.length > 0 &&
      authQueries.every(query => query.data?.status?.allowed === true),
    isLoading: enabled && authQueries.some(query => query.isLoading),
  };
}

export function ProjectDeleteButton({ project, buttonStyle }: ProjectDeleteButtonProps) {
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = useState(false);
  const [namespaces] = Namespace.useList({ clusters: project.clusters });

  const projectNamespaces =
    namespaces?.filter(ns => project.namespaces.includes(ns.metadata.name)) ?? [];
  const updateAuthorization = useAllNamespacesAuthorized(projectNamespaces, 'update');
  const deleteAuthorization = useAllNamespacesAuthorized(
    projectNamespaces,
    'delete',
    openDialog && updateAuthorization.allAuthorized
  );

  // Project deletion affects every namespace, so only expose the action after
  // update authorization has been confirmed for every target namespace.
  if (
    projectNamespaces.length === 0 ||
    updateAuthorization.isLoading ||
    !updateAuthorization.allAuthorized
  ) {
    return null;
  }

  return (
    <>
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
        canDeleteNamespaces={deleteAuthorization.allAuthorized}
      />
    </>
  );
}

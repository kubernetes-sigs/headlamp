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
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Namespace from '../../lib/k8s/namespace';
import { ProjectDefinition } from '../../redux/projectsSlice';
import ActionButton, { ButtonStyle } from '../common/ActionButton';
import { ProjectDeleteDialog } from './ProjectDeleteDialog';
import { projectIncludesNamespace, projectListRequests } from './projectGrouping';

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
      staleTime: 0,
      refetchOnMount: 'always' as const,
    })),
  });

  const hasPendingChecks = authQueries.some(
    query => query.isLoading || query.isFetching || query.status === 'pending'
  );
  const hasFailedChecks = authQueries.some(query => query.isError);

  return {
    allAuthorized:
      enabled &&
      namespaces.length > 0 &&
      !hasPendingChecks &&
      !hasFailedChecks &&
      authQueries.every(query => query.data?.status?.allowed === true),
    isLoading: enabled && hasPendingChecks,
  };
}

export function ProjectDeleteButton({ project, buttonStyle }: ProjectDeleteButtonProps) {
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = useState(false);
  const requests = useMemo(() => projectListRequests(project), [project]);
  const namespaceList = Namespace.useList({
    clusters: project.clusters,
    requests,
  });
  const namespaces = namespaceList.items ?? [];

  const expectedNamespaceRefs = useMemo(
    () =>
      requests.flatMap(request =>
        request.namespaces.map(name => ({
          name,
          cluster: request.cluster,
        }))
      ),
    [requests]
  );

  const projectNamespaces = namespaces.filter(ns =>
    projectIncludesNamespace(project, {
      name: ns.metadata.name,
      cluster: ns.cluster,
    })
  );

  const hasCompleteNamespaceList =
    expectedNamespaceRefs.length > 0 &&
    namespaceList.isSuccess &&
    !namespaceList.isLoading &&
    !namespaceList.isFetching &&
    !namespaceList.isError &&
    projectNamespaces.length === expectedNamespaceRefs.length &&
    expectedNamespaceRefs.every(expected =>
      projectNamespaces.some(
        namespace =>
          namespace.cluster === expected.cluster && namespace.metadata.name === expected.name
      )
    );

  const updateAuthorization = useAllNamespacesAuthorized(
    projectNamespaces,
    'update',
    hasCompleteNamespaceList
  );
  const deleteAuthorization = useAllNamespacesAuthorized(
    projectNamespaces,
    'delete',
    hasCompleteNamespaceList &&
      openDialog &&
      !updateAuthorization.isLoading &&
      updateAuthorization.allAuthorized
  );

  // Project deletion affects every namespace, so only expose the action after
  // all target namespaces are loaded and update authorization is confirmed.
  if (
    !hasCompleteNamespaceList ||
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
        key={
          deleteAuthorization.allAuthorized ? 'can-delete-namespaces' : 'cannot-delete-namespaces'
        }
        open={openDialog}
        project={project}
        onClose={() => setOpenDialog(false)}
        namespaces={projectNamespaces}
        canDeleteNamespaces={deleteAuthorization.allAuthorized}
      />
    </>
  );
}

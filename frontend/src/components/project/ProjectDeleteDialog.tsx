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
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  FormControlLabel,
  Typography,
} from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import Namespace from '../../lib/k8s/namespace';
import { clusterAction } from '../../redux/clusterActionSlice';
import { ProjectDefinition } from '../../redux/projectsSlice';
import { AppDispatch } from '../../redux/stores/store';
import { DialogTitle } from '../common/Dialog';
import AuthVisible from '../common/Resource/AuthVisible';
import { PROJECT_ID_LABEL } from './projectUtils';

interface ProjectDeleteDialogProps {
  open: boolean;
  project: ProjectDefinition;
  onClose: () => void;
  namespaces: Namespace[];
}

export function ProjectDeleteDialog({
  open,
  project,
  onClose,
  namespaces,
}: ProjectDeleteDialogProps) {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const [deleteNamespaces, setDeleteNamespaces] = useState(false);

  const handleDelete = () => {
    const projectNamespaces = namespaces.filter(ns =>
      project.namespaces.includes(ns.metadata.name)
    );

    dispatch(
      clusterAction(
        async () => {
          if (deleteNamespaces) {
            // Delete the entire namespaces
            await Promise.all(projectNamespaces.map(namespace => namespace.delete()));
          } else {
            // Just remove the project label from each namespace
            await Promise.all(
              projectNamespaces.map(async namespace => {
                const updatedData = { ...namespace.jsonData };
                if (updatedData.metadata?.labels) {
                  delete updatedData.metadata.labels[PROJECT_ID_LABEL];
                  // If labels object becomes empty, remove it entirely
                  if (Object.keys(updatedData.metadata.labels).length === 0) {
                    delete updatedData.metadata.labels;
                  }
                }
                return namespace.update(updatedData);
              })
            );
          }
        },
        {
          startMessage: t('Deleting project {{ projectName }}…', { projectName: project.id }),
          cancelledMessage: t('Cancelled deletion of project {{ projectName }}.', {
            projectName: project.id,
          }),
          successMessage: t('Deleted project {{ projectName }}.', { projectName: project.id }),
          errorMessage: t('Error deleting project {{ projectName }}.', { projectName: project.id }),
          successUrl: '/',
        }
      )
    );

    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="project-delete-dialog-title"
      aria-describedby="project-delete-dialog-description"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="project-delete-dialog-title">{t('Delete Project')}</DialogTitle>
      <DialogContent>
        <DialogContentText id="project-delete-dialog-description" component="div">
          <Typography variant="body1" paragraph>
            {t('Are you sure you want to delete project "{{projectName}}"?', {
              projectName: project.id,
            })}
          </Typography>

          <Typography variant="body2" paragraph>
            {t(
              'By default, this will only remove the project label from the following namespaces:'
            )}
          </Typography>

          <ul>
            {project.namespaces.map(namespaceName => (
              <li key={namespaceName}>
                <strong>{namespaceName}</strong>
              </li>
            ))}
          </ul>

          <AuthVisible item={namespaces[0]} authVerb="delete">
            <FormControlLabel
              control={
                <Checkbox
                  checked={deleteNamespaces}
                  onChange={e => setDeleteNamespaces(e.target.checked)}
                  name="deleteNamespaces"
                  color="primary"
                />
              }
              label={
                <Typography variant="body2">
                  {t('Also delete the namespaces (this will remove all resources within them)')}
                </Typography>
              }
            />

            {deleteNamespaces && (
              <Typography variant="body2" color="error" sx={{ mt: 1, fontWeight: 'bold' }}>
                {t(
                  'Warning: This action cannot be undone. All resources in these namespaces will be permanently deleted.'
                )}
              </Typography>
            )}
          </AuthVisible>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" variant="contained">
          {t('Cancel')}
        </Button>
        <Button
          onClick={handleDelete}
          color="primary"
          variant="contained"
          sx={{ minWidth: '200px' }} // Fixed width to prevent button resize
        >
          {deleteNamespaces ? t('Delete Project & Namespaces') : t('Delete Project')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

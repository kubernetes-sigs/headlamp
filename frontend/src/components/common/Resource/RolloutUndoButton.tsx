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

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router';
import { DialogTitle } from '../Dialog';
import ControllerRevision from '../../../lib/k8s/controllerRevision';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import { timeAgo } from '../../../lib/util';
import ActionButton, { ButtonStyle } from '../ActionButton';
import AuthVisible from './AuthVisible';

export type RolloutUndoResource = Deployment | StatefulSet | DaemonSet;

export function isRolloutUndoResource(item: KubeObject): item is RolloutUndoResource {
  return item instanceof Deployment || item instanceof StatefulSet || item instanceof DaemonSet;
}

interface RevisionInfo {
  revisionNumber: number;
  resourceName: string;
  timestamp: string;
  changeReason?: string;
  isCurrent: boolean;
}

interface RolloutUndoButtonProps {
  item: KubeObject;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

export function RolloutUndoButton(props: RolloutUndoButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const { item, buttonStyle, afterConfirm } = props;

  if (!item || !isRolloutUndoResource(item)) {
    return null;
  }

  const [openDialog, setOpenDialog] = useState(false);
  const location = useLocation();
  const { t } = useTranslation(['translation']);
  const dispatchRolloutUndoEvent = useEventCallback(HeadlampEventType.ROLLOUT_UNDO_RESOURCE);

  // Fetch ReplicaSets for Deployments or ControllerRevisions for DaemonSets/StatefulSets
  const [replicaSets] = ReplicaSet.useList({ namespace: item.metadata.namespace });
  const [controllerRevisions] = ControllerRevision.useList({ namespace: item.metadata.namespace });

  async function rolloutUndo() {
    if (item instanceof Deployment) {
      // Handle Deployment rollback using ReplicaSets
      if (!replicaSets) {
        throw new Error('Unable to fetch ReplicaSets');
      }

      // Filter ReplicaSets owned by this Deployment
      const ownedReplicaSets = replicaSets.filter(rs => {
        const ownerRefs = rs.metadata.ownerReferences;
        if (!ownerRefs) return false;

        return ownerRefs.some(
          owner =>
            owner.kind === item.kind &&
            owner.name === item.metadata.name &&
            owner.uid === item.metadata.uid
        );
      });

      if (ownedReplicaSets.length === 0) {
        throw new Error('No ReplicaSets found for this Deployment');
      }

      // Sort by revision annotation (newest first)
      const sortedReplicaSets = ownedReplicaSets.sort((a, b) => {
        const revA = parseInt(a.metadata.annotations?.['deployment.kubernetes.io/revision'] || '0');
        const revB = parseInt(b.metadata.annotations?.['deployment.kubernetes.io/revision'] || '0');
        return revB - revA;
      });

      // Find previous ReplicaSet (second highest revision)
      const previousReplicaSet = sortedReplicaSets[1];

      if (!previousReplicaSet) {
        throw new Error('No previous revision found to rollback to');
      }

      // Patch the deployment with the previous ReplicaSet's pod template
      const patchData = {
        spec: {
          template: previousReplicaSet.spec.template,
        },
      };

      return item.patch(patchData);
    } else {
      // Handle DaemonSet and StatefulSet rollback using ControllerRevisions
      if (!controllerRevisions) {
        throw new Error('Unable to fetch ControllerRevisions');
      }

      // Filter ControllerRevisions owned by this resource
      const ownedRevisions = controllerRevisions.filter(cr => {
        const ownerRefs = cr.metadata.ownerReferences;
        if (!ownerRefs) return false;

        return ownerRefs.some(
          owner =>
            owner.kind === item.kind &&
            owner.name === item.metadata.name &&
            owner.uid === item.metadata.uid
        );
      });

      if (ownedRevisions.length === 0) {
        throw new Error(`No ControllerRevisions found for this ${item.kind}`);
      }

      // Sort by revision number (newest first)
      const sortedRevisions = ownedRevisions.sort((a, b) => b.revision - a.revision);

      // Find previous revision (second highest)
      const previousRevision = sortedRevisions[1];

      if (!previousRevision) {
        throw new Error('No previous revision found to rollback to');
      }

      // Patch the resource with the previous revision's spec
      // ControllerRevision stores the full spec in the data field
      const patchData = {
        spec: previousRevision.data?.spec || previousRevision.data,
      };

      return item.patch(patchData);
    }
  }

  function handleSave() {
    const itemName = item.metadata.name;

    dispatch(
      clusterAction(() => rolloutUndo(), {
        startMessage: t('Rolling back {{ itemName }}…', { itemName }),
        cancelledMessage: t('Cancelled rolling back {{ itemName }}.', { itemName }),
        successMessage: t('Rolled back {{ itemName }}.', { itemName }),
        errorMessage: t('Failed to rollback {{ itemName }}.', { itemName }),
        cancelUrl: location.pathname,
        startUrl: item.getListLink(),
        errorUrl: item.getListLink(),
      })
    );
  }

  return (
    <AuthVisible
      item={item}
      authVerb="update"
      onError={(err: Error) => {
        console.error(`Error while getting authorization for rollout undo button in ${item}:`, err);
      }}
    >
      <ActionButton
        description={t('translation|Rollout Undo')}
        buttonStyle={buttonStyle}
        onClick={() => {
          setOpenDialog(true);
        }}
        icon="mdi:undo"
      />
      <ConfirmDialog
        open={openDialog}
        title={t('translation|Rollout Undo')}
        description={t(
          'translation|Are you sure you want to rollback {{ itemName }} to the previous revision?',
          {
            itemName: item.metadata.name,
          }
        )}
        handleClose={() => setOpenDialog(false)}
        onConfirm={() => {
          dispatchRolloutUndoEvent({
            resource: item,
            status: EventStatus.CONFIRMED,
          });
          handleSave();
          if (afterConfirm) {
            afterConfirm();
          }
        }}
        cancelLabel={t('Cancel')}
        confirmLabel={t('Rollback')}
      />
    </AuthVisible>
  );
}

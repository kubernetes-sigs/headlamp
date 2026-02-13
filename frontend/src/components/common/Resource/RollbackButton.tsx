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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import type { RevisionInfo, RollbackResult } from '../../../lib/k8s/rollback';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import ActionButton, { ButtonStyle } from '../ActionButton';
import AuthVisible from './AuthVisible';
import RollbackDialog from './RollbackDialog';

/**
 * Interface for resources that support rollback.
 */
export interface RollbackableResource extends KubeObject {
  rollback: (toRevision?: number) => Promise<RollbackResult>;
  getRevisionHistory: () => Promise<RevisionInfo[]>;
}

/**
 * Type guard to check if a KubeObject is a resource that supports rollback.
 * Currently supports Deployment, DaemonSet, and StatefulSet.
 */
export function isRollbackableResource(item: KubeObject): item is RollbackableResource {
  return Deployment.isClassOf(item) || DaemonSet.isClassOf(item) || StatefulSet.isClassOf(item);
}

export interface RollbackButtonProps {
  /** The Kubernetes resource to rollback */
  item: KubeObject;
  /** Optional button style override */
  buttonStyle?: ButtonStyle;
  /** Optional callback after user confirms the rollback */
  afterConfirm?: () => void;
}

/**
 * RollbackButton component for rolling back Workloads to a selected revision.
 *
 * This component provides a button that, when clicked, shows a revision selection
 * dialog where the user can pick a specific revision to rollback to.
 *
 * Supported Resources:
 * - Deployment (via ReplicaSets)
 * - DaemonSet (via ControllerRevisions)
 * - StatefulSet (via ControllerRevisions)
 */
export function RollbackButton(props: RollbackButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const { item, buttonStyle, afterConfirm } = props;

  if (!item || !isRollbackableResource(item)) {
    return null;
  }

  const [openDialog, setOpenDialog] = useState(false);
  const location = useLocation();
  const { t } = useTranslation(['translation']);
  const dispatchRollbackEvent = useEventCallback(HeadlampEventType.ROLLBACK_RESOURCE);

  const resource = item;
  const resourceKind = resource.kind;

  async function performRollback(toRevision?: number) {
    const result = await resource.rollback(toRevision);
    if (!result.success) {
      throw new Error(result.message);
    }
    return result;
  }

  function handleConfirm(toRevision?: number) {
    const itemName = resource.metadata.name;

    dispatch(
      clusterAction(() => performRollback(toRevision), {
        startMessage: t('Rolling back {{ itemName }} to previous version…', { itemName }),
        cancelledMessage: t('Cancelled rollback of {{ itemName }}.', { itemName }),
        successMessage: t('Rolled back {{ itemName }} to previous version.', { itemName }),
        errorMessage: t('Failed to rollback {{ itemName }}.', { itemName }),
        cancelUrl: location.pathname,
        startUrl: resource.getDetailsLink(),
        errorUrl: resource.getDetailsLink(),
      })
    );

    setOpenDialog(false);

    // Dispatch event for plugins/tracking
    dispatchRollbackEvent({
      resource: resource,
      status: EventStatus.CONFIRMED,
    });

    if (afterConfirm) {
      afterConfirm();
    }
  }

  return (
    <AuthVisible
      item={item}
      authVerb="update"
      onError={(err: Error) => {
        console.error(`Error while getting authorization for rollback button in ${item}:`, err);
      }}
    >
      <ActionButton
        description={t('translation|Rollback')}
        buttonStyle={buttonStyle}
        onClick={() => {
          setOpenDialog(true);
        }}
        icon="mdi:undo-variant"
      />
      <RollbackDialog
        open={openDialog}
        resourceKind={resourceKind}
        resourceName={resource.metadata.name}
        getRevisionHistory={() => resource.getRevisionHistory()}
        onClose={() => setOpenDialog(false)}
        onConfirm={handleConfirm}
      />
    </AuthVisible>
  );
}

export default RollbackButton;

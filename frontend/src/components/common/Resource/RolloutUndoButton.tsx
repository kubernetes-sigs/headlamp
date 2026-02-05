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

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router';
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
import ActionButton, { ButtonStyle } from '../ActionButton';
import AuthVisible from './AuthVisible';
import { RevisionPickerDialog, RevisionHistoryEntry } from './RevisionPickerDialog';

export type RolloutUndoResource = Deployment | StatefulSet | DaemonSet;

export function isRolloutUndoResource(item: KubeObject): item is RolloutUndoResource {
  return item instanceof Deployment || item instanceof StatefulSet || item instanceof DaemonSet;
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

  const [showPicker, setShowPicker] = useState(false);
  const [pickedRevision, setPickedRevision] = useState<number | null>(null);
  const routePath = useLocation();
  const { t } = useTranslation(['translation']);
  const triggerUndoEvent = useEventCallback(HeadlampEventType.ROLLOUT_UNDO_RESOURCE);

  const [rsCollection] = ReplicaSet.useList({ namespace: item.metadata.namespace });
  const [crCollection] = ControllerRevision.useList({ namespace: item.metadata.namespace });

  const historyEntries = useMemo<RevisionHistoryEntry[]>(() => {
    const workingResource = item;

    if (workingResource instanceof Deployment) {
      if (!rsCollection) return [];

      const belongsToDeployment = (replica: ReplicaSet) => {
        const owners = replica.metadata.ownerReferences || [];
        return owners.some(
          o =>
            o.kind === workingResource.kind &&
            o.name === workingResource.metadata.name &&
            o.uid === workingResource.metadata.uid
        );
      };

      const myReplicaSets = rsCollection.filter(belongsToDeployment);

      const extractRevNumber = (rs: ReplicaSet): number => {
        const revAnnotation = rs.metadata.annotations?.['deployment.kubernetes.io/revision'];
        return revAnnotation ? parseInt(revAnnotation, 10) : 0;
      };

      const latestRevNum =
        myReplicaSets.length > 0 ? Math.max(...myReplicaSets.map(extractRevNumber)) : 0;

      return myReplicaSets
        .map(rs => {
          const revNum = extractRevNumber(rs);
          const changeMsg = rs.metadata.annotations?.['kubernetes.io/change-cause'];

          return {
            number: revNum,
            name: rs.metadata.name,
            created: rs.metadata.creationTimestamp || '',
            reason: changeMsg,
            active: revNum === latestRevNum,
          };
        })
        .sort((x, y) => y.number - x.number);
    } else {
      if (!crCollection) return [];

      const belongsToResource = (ctrlRev: ControllerRevision) => {
        const owners = ctrlRev.metadata.ownerReferences || [];
        return owners.some(
          o =>
            o.kind === workingResource.kind &&
            o.name === workingResource.metadata.name &&
            o.uid === workingResource.metadata.uid
        );
      };

      const myRevisions = crCollection.filter(belongsToResource);
      const topRevision =
        myRevisions.length > 0 ? Math.max(...myRevisions.map(cr => cr.revision)) : 0;

      return myRevisions
        .map(cr => ({
          number: cr.revision,
          name: cr.metadata.name,
          created: cr.metadata.creationTimestamp || '',
          reason: cr.metadata.annotations?.['kubernetes.io/change-cause'],
          active: cr.revision === topRevision,
        }))
        .sort((x, y) => y.number - x.number);
    }
  }, [item, rsCollection, crCollection]);

  async function executeRollback(targetRevision: number) {
    const workingResource = item;

    if (workingResource instanceof Deployment) {
      if (!rsCollection) {
        throw new Error('ReplicaSet data not available');
      }

      const matchingRS = rsCollection.find(rs => {
        const revStr = rs.metadata.annotations?.['deployment.kubernetes.io/revision'];
        return revStr && parseInt(revStr, 10) === targetRevision;
      });

      if (!matchingRS) {
        throw new Error(`Revision ${targetRevision} not found`);
      }

      const updatePayload = {
        spec: {
          template: matchingRS.spec.template,
        },
      };

      return workingResource.patch(updatePayload);
    } else {
      if (!crCollection) {
        throw new Error('ControllerRevision data not available');
      }

      const matchingCR = crCollection.find(cr => cr.revision === targetRevision);

      if (!matchingCR) {
        throw new Error(`Revision ${targetRevision} not found`);
      }

      const updatePayload = {
        spec: matchingCR.data?.spec || matchingCR.data,
      };

      return workingResource.patch(updatePayload);
    }
  }

  function initiateRollback() {
    if (pickedRevision === null) return;

    const resourceLabel = item.metadata.name;
    const revLabel = pickedRevision.toString();

    dispatch(
      clusterAction(() => executeRollback(pickedRevision), {
        startMessage: t('Rolling back {{ itemName }} to revision {{ revisionNum }}…', {
          itemName: resourceLabel,
          revisionNum: revLabel,
        }),
        cancelledMessage: t('Cancelled rollback of {{ itemName }}.', { itemName: resourceLabel }),
        successMessage: t('{{ itemName }} rolled back to revision {{ revisionNum }}.', {
          itemName: resourceLabel,
          revisionNum: revLabel,
        }),
        errorMessage: t('Failed to rollback {{ itemName }}.', { itemName: resourceLabel }),
        cancelUrl: routePath.pathname,
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
          setShowPicker(true);
        }}
        icon="mdi:undo"
      />
      <RevisionPickerDialog
        visible={showPicker}
        resourceName={item.metadata.name}
        revisionList={historyEntries}
        selectedRev={pickedRevision}
        onRevisionClick={revNum => setPickedRevision(revNum)}
        onCancel={() => {
          setShowPicker(false);
          setPickedRevision(null);
        }}
        onConfirm={() => {
          triggerUndoEvent({
            resource: item,
            status: EventStatus.CONFIRMED,
          });
          initiateRollback();
          setShowPicker(false);
          setPickedRevision(null);
          if (afterConfirm) {
            afterConfirm();
          }
        }}
      />
    </AuthVisible>
  );
}

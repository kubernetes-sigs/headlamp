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

import { jsonPatch } from './api/v1/clusterRequests';
import { getApiRoot } from './api/v1/formatUrl';
import type { KubeContainer, LabelSelector } from './cluster';
import ControllerRevision from './controllerRevision';
import type { KubeMetadata } from './KubeMetadata';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type { KubePodSpec } from './pod';
import type { RevisionInfo, RollbackResult } from './rollback';

export interface KubeStatefulSet extends KubeObjectInterface {
  spec: {
    selector: LabelSelector;
    updateStrategy: {
      rollingUpdate: {
        partition: number;
      };
      type: string;
    };
    template: {
      metadata?: KubeMetadata;
      spec: KubePodSpec;
    };
    [other: string]: any;
  };
  status: {
    [otherProps: string]: any;
  };
}

class StatefulSet extends KubeObject<KubeStatefulSet> {
  static kind = 'StatefulSet';
  static apiName = 'statefulsets';
  static apiVersion = 'apps/v1';
  static isNamespaced = true;
  static isScalable = true;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  static getBaseObject(): KubeStatefulSet {
    const baseObject = super.getBaseObject() as KubeStatefulSet;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.spec = {
      selector: {
        matchLabels: { app: 'headlamp' },
      },
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: { partition: 0 },
      },
      template: {
        spec: {
          containers: [
            {
              name: '',
              image: '',
              imagePullPolicy: 'Always',
            },
          ],
          nodeName: '',
        },
      },
    };
    return baseObject;
  }

  getContainers(): KubeContainer[] {
    return this.spec?.template?.spec?.containers || [];
  }

  /**
   * Returns the observed generation of this StatefulSet.
   * Note: This is the object generation, not the ControllerRevision .revision number.
   * It is used as a user-facing indicator of the current state in the rollback dialog.
   */
  getCurrentRevision(): string {
    return (this.status?.observedGeneration ?? this.metadata.generation)?.toString() || '';
  }

  async getOwnedControllerRevisions(): Promise<ControllerRevision[]> {
    return new Promise((resolve, reject) => {
      let cancel: (() => void) | undefined;
      const request = ControllerRevision.apiList(
        (revisions: ControllerRevision[]) => {
          const owned = revisions.filter(rev => {
            const owners = rev.metadata.ownerReferences || [];
            return owners.some((owner: { uid: string }) => owner.uid === this.metadata.uid);
          });
          resolve(owned);
          if (cancel) cancel();
        },
        reject,
        {
          namespace: this.getNamespace(),
          cluster: this.cluster,
          queryParams: {
            labelSelector: this.spec.selector.matchLabels
              ? Object.entries(this.spec.selector.matchLabels)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(',')
              : undefined,
          },
        }
      );
      request().then(c => {
        cancel = c;
      });
    });
  }

  /**
   * Rolls back the StatefulSet to a specific or previous ControllerRevision.
   *
   * This mirrors the behavior of `kubectl rollout undo statefulset/<name>`.
   *
   * @param toRevision - Optional revision number to rollback to. Defaults to the previous revision.
   *
   * @see {@link https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/#rolling-back-a-statefulset | K8s: Rolling Back a StatefulSet}
   * @see {@link https://github.com/kubernetes/kubectl/blob/master/pkg/polymorphichelpers/rollback.go | kubectl rollback implementation}
   */
  async rollback(toRevision?: number): Promise<RollbackResult> {
    try {
      const revisions = await this.getOwnedControllerRevisions();

      const sortedRevisions = revisions
        .filter(rev => rev.revision > 0)
        .sort((a, b) => b.revision - a.revision);

      if (sortedRevisions.length < 2) {
        return {
          success: false,
          message: 'No previous revision available to rollback to',
        };
      }

      // Find target revision: specific or previous (second in sorted list)
      let targetRev;
      if (toRevision !== undefined && toRevision > 0) {
        targetRev = sortedRevisions.find(r => r.revision === toRevision);
        if (!targetRev) {
          return {
            success: false,
            message: `Revision ${toRevision} not found in history`,
          };
        }
      } else {
        targetRev = sortedRevisions[1];
      }

      const targetRevision = targetRev.revision;

      const template = targetRev.data?.spec?.template;

      if (!template) {
        return {
          success: false,
          message: 'Target revision does not contain a valid pod template',
        };
      }

      const cleanTemplate = JSON.parse(JSON.stringify(template));
      if (cleanTemplate.metadata?.labels?.['controller-revision-hash']) {
        delete cleanTemplate.metadata.labels['controller-revision-hash'];
      }

      const patchOperations = [
        {
          op: 'replace' as const,
          path: '/spec/template',
          value: cleanTemplate,
        },
      ];

      const apiRoot = getApiRoot('apps', 'v1');
      const url = `${apiRoot}/namespaces/${this.getNamespace()}/statefulsets/${this.getName()}`;

      await jsonPatch(url, patchOperations, true, { cluster: this.cluster });

      return {
        success: true,
        message: `Rolled back to revision ${targetRevision}`,
        previousRevision: targetRevision,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to rollback: ${errorMessage}`,
      };
    }
  }

  /**
   * Get the revision history for this StatefulSet.
   * Returns a list of RevisionInfo objects sorted by revision number (descending).
   */
  async getRevisionHistory(): Promise<RevisionInfo[]> {
    const revisions = await this.getOwnedControllerRevisions();

    // Determine the current revision (highest revision number)
    const sortedRevisions = revisions
      .filter(rev => rev.revision > 0)
      .sort((a, b) => b.revision - a.revision);

    const highestRevision = sortedRevisions.length > 0 ? sortedRevisions[0].revision : 0;

    return sortedRevisions.map(rev => {
      const template = rev.data?.spec?.template;
      const images = (template?.spec?.containers || []).map(
        (c: { image?: string }) => c.image || ''
      );
      return {
        revision: rev.revision,
        createdAt: rev.metadata.creationTimestamp || '',
        images,
        isCurrent: rev.revision === highestRevision,
        podTemplate: template,
      };
    });
  }
}

export default StatefulSet;

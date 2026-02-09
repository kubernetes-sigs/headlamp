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
import type { KubeMetadata } from './KubeMetadata';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type { KubePodSpec } from './pod';
import ReplicaSet, { type KubeReplicaSet } from './replicaSet';
import { RollbackResult } from './rollback';

export type { RollbackResult };

export interface KubeDeployment extends KubeObjectInterface {
  spec: {
    selector?: LabelSelector;
    strategy?: {
      type: string;
      [otherProps: string]: any;
    };
    template: {
      metadata?: KubeMetadata;
      spec: KubePodSpec;
    };
    [otherProps: string]: any;
  };
  status: {
    [otherProps: string]: any;
  };
}

class Deployment extends KubeObject<KubeDeployment> {
  static kind = 'Deployment';
  static apiName = 'deployments';
  static apiVersion = 'apps/v1';
  static isNamespaced = true;
  static isScalable = true;

  get spec() {
    return this.getValue('spec');
  }

  get status() {
    return this.getValue('status');
  }

  getContainers(): KubeContainer[] {
    return this.spec?.template?.spec?.containers || [];
  }

  getMatchLabelsList(): string[] {
    const labels = this.spec.selector.matchLabels || {};
    return Object.keys(labels).map(key => `${key}=${labels[key]}`);
  }

  /**
   * Get the current revision number of the deployment from its annotations.
   *
   * @returns The current revision as a string, or '0' if not available.
   * @see {@link https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#revision-history-limit | K8s: Deployment Revision History}
   */
  getCurrentRevision(): string {
    return this.metadata.annotations?.['deployment.kubernetes.io/revision'] || '0';
  }

  /**
   * Get all ReplicaSets owned by this Deployment.
   * @returns Promise resolving to array of owned ReplicaSets.
   */
  async getOwnedReplicaSets(): Promise<ReplicaSet[]> {
    return new Promise((resolve, reject) => {
      let cancel: (() => void) | undefined;
      const request = ReplicaSet.apiList(
        (list: ReplicaSet[]) => {
          const owned = list.filter(rs =>
            rs.metadata.ownerReferences?.some(
              ref => ref.kind === 'Deployment' && ref.uid === this.metadata.uid
            )
          );
          resolve(owned);
          if (cancel) cancel();
        },
        reject,
        { namespace: this.getNamespace(), cluster: this.cluster }
      );
      request().then(c => {
        cancel = c;
      });
    });
  }

  /**
   * Rollback to the previous revision.
   * Finds the second-most-recent ReplicaSet and patches the deployment
   * with its pod template, similar to `kubectl rollout undo`.
   *
   * @see {@link https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment | K8s: Rolling Back a Deployment}
   * @see {@link https://github.com/kubernetes/kubectl/blob/master/pkg/polymorphichelpers/rollback.go | kubectl rollback implementation}
   *
   * @returns Promise with rollback result containing success status and message.
   */
  async rollback(): Promise<RollbackResult> {
    if (this.spec?.paused) {
      return {
        success: false,
        message: 'Cannot rollback a paused deployment',
      };
    }

    try {
      const replicaSets = await this.getOwnedReplicaSets();

      const sortedRS = replicaSets
        .map(rs => ({
          rs,
          revision: parseInt(
            rs.metadata.annotations?.['deployment.kubernetes.io/revision'] || '0',
            10
          ),
        }))
        .filter(r => r.revision > 0)
        .sort((a, b) => b.revision - a.revision);

      if (sortedRS.length < 2) {
        return {
          success: false,
          message: 'No previous revision available to rollback to',
        };
      }

      const previousRS = sortedRS[1].rs;
      const previousRevision = sortedRS[1].revision;

      const template = JSON.parse(
        JSON.stringify(previousRS.spec.template)
      ) as KubeReplicaSet['spec']['template'];

      if (template.metadata?.labels?.['pod-template-hash']) {
        delete template.metadata.labels['pod-template-hash'];
      }
      const patchOperations = [
        {
          op: 'replace' as const,
          path: '/spec/template',
          value: template,
        },
      ];

      const apiRoot = getApiRoot('apps', 'v1');
      const url = `${apiRoot}/namespaces/${this.getNamespace()}/deployments/${this.getName()}`;

      await jsonPatch(url, patchOperations, true, { cluster: this.cluster });

      return {
        success: true,
        message: `Rolled back to revision ${previousRevision}`,
        previousRevision,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to rollback: ${errorMessage}`,
      };
    }
  }

  static getBaseObject(): KubeDeployment {
    const baseObject = super.getBaseObject() as KubeDeployment;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
      labels: { app: 'headlamp' },
    };
    baseObject.spec = {
      selector: {
        matchLabels: { app: 'headlamp' },
      },
      template: {
        spec: {
          containers: [
            {
              name: '',
              image: '',
              ports: [{ containerPort: 80 }],
              imagePullPolicy: 'Always',
            },
          ],
          nodeName: '',
        },
      },
    };

    return baseObject;
  }
}

export default Deployment;

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

import { post } from './apiProxy';
import { ClusterRequestParams } from './apiProxy';
import { RolloutEndpoint } from './apiProxy';
import { ApiEndpoint } from './apiProxy';
import { LabelSelector } from './cluster';
import { KubeMetadata } from './KubeMetadata';
import { KubeObject, KubeObjectInterface } from './KubeObject';
import { KubePodSpec } from './pod';

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

interface RolloutOptions {
  revision?: number;
  dryRun?: boolean;
}

class Deployment extends KubeObject<KubeDeployment> {
  static kind = 'Deployment';
  static apiName = 'deployments';
  static apiVersion = 'apps/v1';
  static isNamespaced = true;

  protected static endpoint: ApiEndpoint<KubeDeployment> & { rollout?: RolloutEndpoint };

  static {
    this.endpoint = this.apiEndpoint as ApiEndpoint<KubeDeployment>;
    this.endpoint.rollout = {
      undo: (
        name: string,
        namespace: string,
        options?: RolloutOptions,
        params?: ClusterRequestParams
      ) =>
        post(
          `/apis/apps/v1/namespaces/${namespace}/deployments/${name}/rollback`,
          {
            kind: 'DeploymentRollback',
            apiVersion: 'apps/v1',
            name: name,
            rollbackTo: {
              revision: options?.revision || 0,
            },
          },
          options?.dryRun ? { dry_run: 'All' } : undefined,
          params
        ),
      history: (
        name: string,
        namespace: string,
        revision?: number,
        params?: ClusterRequestParams
      ) =>
        post(
          `/apis/apps/v1/namespaces/${namespace}/deployments/${name}/history`,
          {
            revision: revision || 0,
          },
          undefined,
          params
        ),
    };
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }
}

export default Deployment;

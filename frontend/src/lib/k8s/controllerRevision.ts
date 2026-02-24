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

import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

/**
 * ControllerRevision implements an immutable snapshot of state data.
 * Clients are responsible for serializing and deserializing the objects
 * that contain their internal state.
 *
 * Used by DaemonSets and StatefulSets to store revision history for rollback.
 *
 * @see https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/controller-revision-v1/
 */
export interface KubeControllerRevision extends KubeObjectInterface {
  /**
   * Data is the serialized representation of the state.
   * Contains the previous spec of the owning controller.
   */
  data?: {
    spec?: {
      template?: {
        [key: string]: any;
      };
      [key: string]: any;
    };
    [key: string]: any;
  };
  /**
   * Revision indicates the revision of the state represented by Data.
   */
  revision: number;
}

/**
 * ControllerRevision implements an immutable snapshot of state data.
 * Used for rollback operations on DaemonSets and StatefulSets.
 */
class ControllerRevision extends KubeObject<KubeControllerRevision> {
  static kind = 'ControllerRevision';
  static apiName = 'controllerrevisions';
  static apiVersion = 'apps/v1';
  static isNamespaced = true;

  get data() {
    return this.jsonData.data;
  }

  get revision(): number {
    return this.jsonData.revision;
  }
}

export default ControllerRevision;

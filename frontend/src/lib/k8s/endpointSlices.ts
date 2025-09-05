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

import { KubeMetadata } from './KubeMetadata';
import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface KubeEndpointSliceEndpointConditions {
  ready: boolean;
  serving: boolean;
  terminating: boolean;
}

export interface KubeEndpointSliceEndpoint {
  addresses: string[];
  hostname: string;
  nodeName?: string;
  conditions?: KubeEndpointSliceEndpointConditions;
  zone?: string;
  targetRef?: Pick<KubeObjectInterface, 'apiVersion' | 'kind'> &
    Pick<KubeMetadata, 'name' | 'namespace' | 'resourceVersion' | 'uid'> & {
      fieldPath: string;
    };
}

export interface KubeEndpointSlicePort {
  name?: string;
  port: number;
  protocol: string;
  appProtocol?: string;
}

export interface KubeEndpointSlice extends KubeObjectInterface {
  addressType?: string;
  ports?: KubeEndpointSlicePort[];
  endpoints?: KubeEndpointSliceEndpoint[];
}

class EndpointSlice extends KubeObject<KubeEndpointSlice> {
  static kind = 'EndpointSlice';
  static apiName = 'endpointslices';
  static apiVersion = 'discovery.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeEndpointSlice {
    const baseObject = super.getBaseObject() as KubeEndpointSlice;
    return baseObject;
  }
  get spec() {
    return this.jsonData;
  }

  get ports() {
    return this.jsonData?.ports?.map(port => port.port) ?? [];
  }

  getOwnerServiceName() {
    return this.jsonData.metadata.ownerReferences?.find(t => t.kind === 'Service')?.name;
  }
}

export default EndpointSlice;

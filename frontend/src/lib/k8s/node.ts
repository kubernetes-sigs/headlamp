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

import React from 'react';
import { useErrorState } from '../util';
import { useConnectApi } from '.';
import { metrics } from './api/v1/metricsApi';
import type { ApiError } from './api/v2/ApiError';
import type { KubeCondition, KubeMetrics } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeNode extends KubeObjectInterface {
  status: {
    addresses?: {
      address: string;
      type: string;
    }[];
    allocatable?: {
      cpu: any;
      memory: any;
      ephemeralStorage: any;
      hugepages_1Gi: any;
      hugepages_2Mi: any;
      pods: any;
    };
    capacity?: {
      cpu: any;
      memory: any;
      ephemeralStorage: any;
      hugepages_1Gi: any;
      hugepages_2Mi: any;
      pods: any;
    };
    conditions?: (Omit<KubeCondition, 'lastProbeTime' | 'lastUpdateTime'> & {
      lastHeartbeatTime: string;
    })[];
    nodeInfo?: {
      architecture: string;
      bootID: string;
      containerRuntimeVersion: string;
      kernelVersion: string;
      kubeProxyVersion: string;
      kubeletVersion: string;
      machineID: string;
      operatingSystem: string;
      osImage: string;
      systemUUID: string;
    };
  };
  spec: {
    podCIDR: string;
    taints: {
      key: string;
      value?: string;
      effect: string;
    }[];
    [otherProps: string]: any;
  };
}

class Node extends KubeObject<KubeNode> {
  static kind = 'Node';
  static apiName = 'nodes';
  static apiVersion = 'v1';
  static isNamespaced = false;

  get status(): KubeNode['status'] {
    return this.jsonData.status;
  }

  get spec(): KubeNode['spec'] {
    return this.jsonData.spec;
  }

  static useMetrics(): [KubeMetrics[] | null, ApiError | null] {
    const [nodeMetrics, setNodeMetrics] = React.useState<KubeMetrics[] | null>(null);
    const [error, setError] = useErrorState(setNodeMetrics);

    function setMetrics(metrics: KubeMetrics[]) {
      setNodeMetrics(metrics);

      if (metrics !== null) {
        setError(null);
      }
    }

    useConnectApi(metrics.bind(null, '/apis/metrics.k8s.io/v1beta1/nodes', setMetrics, setError));

    return [nodeMetrics, error];
  }

  getExternalIP(): string {
    return this.status.addresses?.find(address => address.type === 'ExternalIP')?.address || '';
  }

  getInternalIP(): string {
    return this.status.addresses?.find(address => address.type === 'InternalIP')?.address || '';
  }
}

export default Node;

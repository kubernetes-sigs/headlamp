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

import { LabelSelector } from './cluster';
import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface AdminNetworkPolicySubject {
  namespaces?: LabelSelector;
  pods?: NamespacedPod;
}

export interface NamespacedPod {
  namespaceSelector?: LabelSelector;
  podSelector?: LabelSelector;
}

export interface Port {
  port?: number;
  protocol?: string;
}
export interface PortRange {
  protocol?: string;
  start?: number;
  end?: number;
}
export interface AdminNetworkPolicyPort {
  portNumber?: Port;
  namedPort?: string;
  portRange?: Port;
}

export interface IPBlock {
  cidr: string;
  except: string[];
}

export interface AdminNetworkPolicyIngressPeer {
  namespaces?: LabelSelector;
  pods?: NamespacedPod;
}

export interface AdminNetworkPolicyEgressPeer {
  namespaces?: LabelSelector;
  pods?: NamespacedPod;
  nodes?: LabelSelector;
  networks?: IPBlock[];
  domainNames?: string[];
}

export interface AdminNetworkPolicyPeer {
  ipBlock?: IPBlock;
  namespaceSelector?: LabelSelector;
  podSelector?: LabelSelector;
}

export type AdminNetworkPolicyRuleAction = 'Allow' | 'Deny' | 'Pass';

export interface AdminNetworkPolicyEgressRule {
  name?: string;
  action: AdminNetworkPolicyRuleAction;
  to: AdminNetworkPolicyEgressPeer[];
  ports?: AdminNetworkPolicyPort[];
}

export interface AdminNetworkPolicyIngressRule {
  name?: string;
  action: AdminNetworkPolicyRuleAction;
  from: AdminNetworkPolicyIngressPeer[];
  ports?: AdminNetworkPolicyPort[];
}

export interface KubeAdminNetworkPolicy extends KubeObjectInterface {
  priority: number;
  subject: AdminNetworkPolicySubject;
  ingress?: AdminNetworkPolicyIngressRule[];
  egress?: AdminNetworkPolicyEgressRule[];
  status?: 'status';
}

class AdminNetworkPolicy extends KubeObject<KubeAdminNetworkPolicy> {
  static kind = 'AdminNetworkPolicy';
  static apiName = 'adminnetworkpolicies';
  static apiVersion = 'policy.networking.k8s.io/v1alpha1';
  static isNamespaced = false;

  static getBaseObject(): KubeAdminNetworkPolicy {
    const baseObject = super.getBaseObject() as KubeAdminNetworkPolicy;
    baseObject.spec = {
      priority: 100,
      subject: {
        pods: {
          namespaceSelector: {
            matchLabels: { app: 'headlamp' },
          },
          podSelector: {
            matchLabels: { app: 'headlamp' },
          },
        },
      },
      egress: [
        {
          action: 'Allow',
          to: [
            {
              namespaces: {
                matchLabels: { app: 'headlamp' },
              },
            },
          ],
          name: 'default-egress',
          ports: [
            {
              portNumber: {
                port: 443,
                protocol: 'TCP',
              },
            },
            {
              portNumber: {
                port: 80,
                protocol: 'TCP',
              },
            },
          ],
        },
      ],
      ingress: [
        {
          action: 'Allow',
          from: [
            {
              namespaces: {
                matchLabels: { app: 'headlamp' },
              },
            },
          ],
          name: 'default-egress',
          ports: [
            {
              portNumber: {
                port: 443,
                protocol: 'TCP',
              },
            },
            {
              portNumber: {
                port: 80,
                protocol: 'TCP',
              },
            },
          ],
        },
      ],
    };
    return baseObject;
  }

  static get pluralName() {
    return 'adminnetworkpolicies';
  }
}

export default AdminNetworkPolicy;

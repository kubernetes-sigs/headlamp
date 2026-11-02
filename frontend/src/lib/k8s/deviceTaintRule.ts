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

import type { KubeCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { isResourceServed } from './resourceAvailability';

export type DeviceTaintEffect = 'None' | 'NoSchedule' | 'NoExecute' | string;

/**
 * Which devices a DeviceTaintRule applies to. All set fields must match.
 * An empty selector matches every device, while a rule without a selector
 * matches no device.
 */
export interface DeviceTaintSelector {
  driver?: string;
  pool?: string;
  device?: string;
}

export interface DeviceTaint {
  effect: DeviceTaintEffect;
  key: string;
  value?: string;
  timeAdded?: string;
}

export interface DeviceTaintRuleSpec {
  deviceSelector?: DeviceTaintSelector;
  taint: DeviceTaint;
}

export interface DeviceTaintRuleStatus {
  conditions?: KubeCondition[];
}

export interface KubeDeviceTaintRule extends KubeObjectInterface {
  spec: DeviceTaintRuleSpec;
  status?: DeviceTaintRuleStatus;
}

class DeviceTaintRule extends KubeObject<KubeDeviceTaintRule> {
  static kind = 'DeviceTaintRule';
  static apiName = 'devicetaintrules';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = false;

  /** Whether the cluster serves the stable DeviceTaintRule API. */
  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(cluster, DeviceTaintRule.apiVersion, DeviceTaintRule.apiName);
  }

  get spec(): KubeDeviceTaintRule['spec'] {
    return this.jsonData.spec;
  }

  get status(): KubeDeviceTaintRule['status'] {
    return this.jsonData.status;
  }

  /** The device selector, or undefined when the rule has none and so matches no device. */
  get selector(): DeviceTaintSelector | undefined {
    return this.spec?.deviceSelector;
  }

  get selectorEntries(): Array<{ field: keyof DeviceTaintSelector; value: string }> {
    return (['driver', 'pool', 'device'] as const).flatMap(field => {
      const value = this.selector?.[field];
      return value ? [{ field, value }] : [];
    });
  }

  /** Whether the rule has no selector, which the API treats as matching no device. */
  get matchesNoDevices(): boolean {
    return !this.selector;
  }

  /** Whether the rule has an empty selector, which the API treats as matching every device. */
  get matchesAllDevices(): boolean {
    return !!this.selector && this.selectorEntries.length === 0;
  }

  get taint(): DeviceTaint {
    return this.spec?.taint;
  }

  get evictionCondition(): KubeCondition | undefined {
    return this.status?.conditions?.find(condition => condition.type === 'EvictionInProgress');
  }

  get evictionInProgress(): boolean | undefined {
    const status = this.evictionCondition?.status;
    if (status === 'True') {
      return true;
    }
    if (status === 'False') {
      return false;
    }
    return undefined;
  }
}

export default DeviceTaintRule;

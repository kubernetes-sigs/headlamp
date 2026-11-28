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

import type { BaseCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { isResourceServed } from './resourceAvailability';

/** What happens to a request once the level is at its concurrency limit. */
export interface LimitResponse {
  type: string;
  queuing?: {
    /** How many queues requests are spread across. */
    queues?: number;
    /** How many of those queues a single flow may land in. */
    handSize?: number;
    queueLengthLimit?: number;
  };
}

export interface LimitedPriorityLevelConfiguration {
  /** The level's share of the apiserver's total concurrency, relative to other levels. */
  nominalConcurrencyShares?: number;
  /** How much of its share it may lend out while idle. */
  lendablePercent?: number;
  /** How much it may borrow from others, over its nominal share. */
  borrowingLimitPercent?: number;
  limitResponse?: LimitResponse;
}

/** An exempt level is never queued or rejected; the fields only affect lending. */
export interface ExemptPriorityLevelConfiguration {
  nominalConcurrencyShares?: number;
  lendablePercent?: number;
}

export interface PriorityLevelConfigurationSpec {
  type: string;
  limited?: LimitedPriorityLevelConfiguration;
  exempt?: ExemptPriorityLevelConfiguration;
}

export interface KubePriorityLevelConfiguration extends KubeObjectInterface {
  spec: PriorityLevelConfigurationSpec;
  status?: { conditions?: BaseCondition[] };
}

class PriorityLevelConfiguration extends KubeObject<KubePriorityLevelConfiguration> {
  static kind = 'PriorityLevelConfiguration';
  static apiName = 'prioritylevelconfigurations';
  static apiVersion = 'flowcontrol.apiserver.k8s.io/v1';
  static isNamespaced = false;

  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(cluster, this.apiVersion, this.apiName);
  }

  static getBaseObject() {
    return {
      ...super.getBaseObject(),
      spec: { type: 'Limited', limited: { limitResponse: { type: 'Reject' } } },
    };
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  get type(): string {
    return this.spec?.type ?? '';
  }

  /** An exempt level admits every request immediately, whatever the load. */
  get isExempt(): boolean {
    return this.spec?.type === 'Exempt';
  }

  private get limited() {
    return this.type === 'Limited' ? this.spec?.limited : undefined;
  }

  /** The settings in force, which live under a different key for each type. */
  get settings(): LimitedPriorityLevelConfiguration | ExemptPriorityLevelConfiguration | undefined {
    return this.isExempt ? this.spec?.exempt : this.limited;
  }

  get nominalConcurrencyShares(): number | undefined {
    return this.settings?.nominalConcurrencyShares;
  }

  get lendablePercent(): number | undefined {
    return this.settings?.lendablePercent;
  }

  get borrowingLimitPercent(): number | undefined {
    return this.limited?.borrowingLimitPercent;
  }

  /** How the level behaves at its limit: Queue, Reject, or nothing when exempt. */
  get limitResponseType(): string | undefined {
    return this.limited?.limitResponse?.type;
  }

  /** Queue parameters, set only when the limit response is Queue. */
  get queuing(): LimitResponse['queuing'] | undefined {
    return this.limitResponseType === 'Queue' ? this.limited?.limitResponse?.queuing : undefined;
  }

  get conditions(): BaseCondition[] {
    return this.status?.conditions ?? [];
  }
}

export default PriorityLevelConfiguration;

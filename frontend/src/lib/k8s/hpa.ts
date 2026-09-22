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

import type { LabelSelector } from './cluster';
import type { KubeMetadata } from './KubeMetadata';
import { KubeObject, type KubeObjectClass, type KubeObjectInterface } from './KubeObject';
import { ResourceClasses } from './resourceClasses';
export interface CrossVersionObjectReference {
  apiVersion: string;
  kind: string;
  name: string;
}

interface MetricIdentifier {
  name: string;
  selector?: LabelSelector;
}

interface MetricValueStatus {
  averageUtilization?: number;
  averageValue?: string;
  value?: string;
}

/** The current reading in the same form as the target: a percentage, an average or a value. */
function currentReading(status: MetricValueStatus, target?: MetricTarget): string | undefined {
  const utilization =
    status.averageUtilization !== undefined && status.averageUtilization !== null
      ? `${status.averageUtilization}%`
      : undefined;
  switch (target?.type) {
    case 'Utilization':
      return utilization;
    case 'AverageValue':
      return status.averageValue || undefined;
    case 'Value':
      return status.value || undefined;
    default:
      return utilization ?? (status.averageValue || status.value || undefined);
  }
}

function metricValueStatus(status: MetricValueStatus, t: Function, target?: MetricTarget): string {
  return currentReading(status, target) ?? t('translation|<unknown>');
}

interface MetricTarget {
  type: MetricType;
  averageUtilization?: number;
  averageValue?: string;
  value?: string;
}

function metricTargetValue(target: MetricTarget): string {
  switch (target.type) {
    case 'Utilization':
      if (target.averageUtilization !== null && target.averageUtilization !== undefined) {
        return `${target.averageUtilization}%`;
      }
      return '';
    case 'AverageValue':
      return `${target.averageValue}`;
    case 'Value':
      return `${target.value}`;
    default:
      return '';
  }
}

function defineMetricTarget(target: MetricTarget): string {
  switch (target.type) {
    case 'Utilization':
      return '(as a percentage of request)';
    case 'AverageValue':
      return '(target average value)';
    case 'Value':
      return '(target value)';
    default:
      return '<auto>';
  }
}

type MetricType = 'Utilization' | 'Value' | 'AverageValue';

type MetricSourceType = 'Resource' | 'Pods' | 'Object' | 'External' | 'ContainerResource';

interface HpaSpec {
  maxReplicas: number;
  minReplicas?: number;
  targetCPUUtilizationPercentage?: number;
  scaleTargetRef: CrossVersionObjectReference;
  metrics: {
    external?: {
      metric: MetricIdentifier;
      target: MetricTarget;
    };
    object?: {
      metric: MetricIdentifier;
      describedObject: CrossVersionObjectReference;
      target: MetricTarget;
    };
    pods?: {
      metric: MetricIdentifier;
      target: MetricTarget;
    };
    resource?: {
      name: string;
      target: MetricTarget;
    };
    containerResource?: {
      container: string;
      name: string;
      target: MetricTarget;
    };
    type: MetricSourceType;
  }[];
}

interface HpaStatus {
  currentCPUUtilizationPercentage?: number;
  currentReplicas: number;
  desiredReplicas: number;
  lastScaleTime: string;
  observedGeneration?: number;
  currentMetrics:
    | {
        type: string;
        external?: {
          current: MetricValueStatus;
          metric: MetricIdentifier;
        };
        object?: {
          current: MetricValueStatus;
          metric: MetricIdentifier;
          describedObject?: CrossVersionObjectReference;
          desiredObject?: CrossVersionObjectReference;
        };
        pods?: {
          current: MetricValueStatus;
          metric: MetricIdentifier;
        };
        resource?: {
          name: string;
          current: MetricValueStatus;
        };
        containerResource?: {
          container: string;
          name: string;
          current: MetricValueStatus;
        };
      }[]
    | null;
  conditions: {
    type: string;
    status: string;
    lastTransitionTime: string;
    reason: string;
    message: string;
  }[];
}
export interface KubeHPA extends KubeObjectInterface {
  spec: HpaSpec;
  status: HpaStatus;
}

interface HPAMetrics {
  name: string;
  definition: string;
  value: string;
  shortValue: string;
}

/**
 * Serializes a value with object keys sorted, so that two selectors with the same content but a
 * different key order compare equal.
 */
function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJSON(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Treats a missing selector and an empty one as the same selector. matchExpressions and the
 * values of each expression are sets, so their order does not matter either.
 */
function normalizedSelector(selector?: LabelSelector) {
  const result: Record<string, unknown> = {};
  if (selector?.matchLabels && Object.keys(selector.matchLabels).length > 0) {
    result.matchLabels = selector.matchLabels;
  }
  if (selector?.matchExpressions?.length) {
    result.matchExpressions = selector.matchExpressions
      .map(expr => canonicalJSON({ ...expr, values: expr.values ? [...expr.values].sort() : [] }))
      .sort();
  }
  return canonicalJSON(result);
}

/** A metric is identified by its name and optional selector (autoscaling/v2 MetricIdentifier). */
function sameMetric(a?: MetricIdentifier, b?: MetricIdentifier) {
  return a?.name === b?.name && normalizedSelector(a?.selector) === normalizedSelector(b?.selector);
}

/** Status may omit describedObject; only compare it when both sides have one. */
function sameObject(a?: CrossVersionObjectReference, b?: CrossVersionObjectReference) {
  if (!a || !b) {
    return true;
  }
  return a.apiVersion === b.apiVersion && a.kind === b.kind && a.name === b.name;
}

type SpecMetric = HpaSpec['metrics'][number];
type CurrentMetric = NonNullable<HpaStatus['currentMetrics']>[number];

function sameIdentifier(cm: CurrentMetric, spec: SpecMetric) {
  if (cm.type !== spec.type) {
    return false;
  }
  switch (spec.type) {
    case 'Resource':
      return cm.resource?.name === spec.resource?.name;
    case 'Pods':
      return sameMetric(cm.pods?.metric, spec.pods?.metric);
    case 'Object':
      return (
        sameMetric(cm.object?.metric, spec.object?.metric) &&
        sameObject(cm.object?.describedObject, spec.object?.describedObject)
      );
    case 'External':
      return sameMetric(cm.external?.metric, spec.external?.metric);
    case 'ContainerResource':
      return (
        cm.containerResource?.container === spec.containerResource?.container &&
        cm.containerResource?.name === spec.containerResource?.name
      );
    default:
      return false;
  }
}

function specTarget(spec: SpecMetric): MetricTarget | undefined {
  switch (spec.type) {
    case 'Resource':
      return spec.resource?.target;
    case 'Pods':
      return spec.pods?.target;
    case 'Object':
      return spec.object?.target;
    case 'External':
      return spec.external?.target;
    case 'ContainerResource':
      return spec.containerResource?.target;
    default:
      return undefined;
  }
}

function currentValue(cm: CurrentMetric): MetricValueStatus | undefined {
  return (
    cm.resource?.current ??
    cm.pods?.current ??
    cm.object?.current ??
    cm.external?.current ??
    cm.containerResource?.current
  );
}

/**
 * Pairs each spec metric with its own status entry. An HPA can list the same metric twice with
 * different targets (for example cpu by Utilization and by AverageValue), so a status entry
 * only counts as a candidate if it carries a reading in the target's form, and each entry is
 * used once. Entries with the fewest candidates are paired first: a Utilization status also
 * carries averageValue, so pairing in spec order could hand it to the AverageValue target and
 * leave the Utilization target without one.
 */
function matchCurrentMetrics(
  currentMetrics: HpaStatus['currentMetrics'],
  specMetrics: SpecMetric[]
): (CurrentMetric | undefined)[] {
  const matched: (CurrentMetric | undefined)[] = specMetrics.map(() => undefined);
  if (!currentMetrics) {
    return matched;
  }
  const candidates = specMetrics.map(spec => {
    const target = specTarget(spec);
    return currentMetrics
      .map((cm, index) => ({ cm, index }))
      .filter(({ cm }) => {
        if (!sameIdentifier(cm, spec)) {
          return false;
        }
        const current = currentValue(cm);
        return !!current && currentReading(current, target) !== undefined;
      })
      .map(({ index }) => index);
  });
  const order = specMetrics
    .map((_, index) => index)
    .sort((a, b) => candidates[a].length - candidates[b].length || a - b);
  const used = new Set<number>();
  for (const specIndex of order) {
    const statusIndex = candidates[specIndex].find(index => !used.has(index));
    if (statusIndex !== undefined) {
      used.add(statusIndex);
      matched[specIndex] = currentMetrics[statusIndex];
    }
  }
  return matched;
}

class HPA extends KubeObject<KubeHPA> {
  static kind = 'HorizontalPodAutoscaler';
  static apiName = 'horizontalpodautoscalers';
  static apiVersion = 'autoscaling/v2';
  static isNamespaced = true;

  static getBaseObject(): KubeHPA {
    const baseObject = super.getBaseObject() as KubeHPA;
    baseObject.spec = {
      maxReplicas: 0,
      minReplicas: 0,
      scaleTargetRef: { apiVersion: '', kind: '', name: '' },
      metrics: [],
    };
    return baseObject;
  }

  get spec(): HpaSpec {
    return this.jsonData.spec;
  }

  get status(): HpaStatus {
    return this.jsonData.status;
  }

  metrics(t: Function): HPAMetrics[] {
    const metrics: HPAMetrics[] = [];
    const specMetrics = this.spec?.metrics || [];
    const statuses = matchCurrentMetrics(this.status?.currentMetrics, specMetrics);
    for (let iter = 0; iter < specMetrics.length; iter++) {
      const spec = specMetrics[iter];
      const status = statuses[iter];
      switch (spec.type) {
        case 'External':
          {
            if (spec.external) {
              const value = `${
                status && status.external
                  ? metricValueStatus(status.external.current, t, spec.external.target)
                  : t('translation|<unknown>')
              }/${metricTargetValue(spec.external.target)}`;
              const metricName = spec.external.metric?.name || t('translation|<unknown>');
              const definition = `"${metricName}" ${defineMetricTarget(spec.external.target)}`;
              metrics.push({
                name: metricName,
                definition,
                value,
                shortValue: value,
              });
            }
          }
          break;
        case 'Object':
          {
            if (spec.object) {
              const value = `${
                status && status.object
                  ? metricValueStatus(status.object.current, t, spec.object.target)
                  : t('translation|<unknown>')
              }/${metricTargetValue(spec.object.target)}`;
              const metricName = spec.object.metric?.name || t('translation|<unknown>');
              const definition = t(
                'translation|"{{metricName}}" on {{objectKind}}/{{objectName}} {{metricTarget}}',
                {
                  metricName,
                  objectKind: spec.object.describedObject?.kind || t('translation|<unknown>'),
                  objectName: spec.object.describedObject?.name || t('translation|<unknown>'),
                  metricTarget: defineMetricTarget(spec.object.target),
                }
              );
              metrics.push({
                name: metricName,
                definition,
                value,
                shortValue: value,
              });
            }
          }
          break;
        case 'Pods':
          {
            if (spec.pods) {
              const value = `${
                status && status.pods
                  ? metricValueStatus(status.pods.current, t, spec.pods.target)
                  : t('translation|<unknown>')
              }/${metricTargetValue(spec.pods.target)}`;
              const metricName = spec.pods.metric?.name || t('translation|<unknown>');
              const definition = t('translation|"{{metricName}}" on pods', {
                metricName,
              });
              metrics.push({
                name: metricName,
                definition,
                value,
                shortValue: value,
              });
            }
          }
          break;
        case 'Resource':
          {
            if (spec.resource) {
              let definition = t('translation|resource {{resourceName}} on pods', {
                resourceName: spec.resource.name,
              });
              let value = ``;
              let shortValue = ``;
              if (spec.resource.target.type === 'AverageValue') {
                value = `${
                  status && status.resource
                    ? metricValueStatus(status.resource.current, t, spec.resource.target)
                    : t('translation|<unknown>')
                }/${metricTargetValue(spec.resource.target)}`;
                shortValue = `${
                  status && status.resource
                    ? metricValueStatus(status.resource.current, t, spec.resource.target)
                    : t('translation|<unknown>')
                }/${metricTargetValue(spec.resource.target)}`;
              }
              if (spec.resource.target.type === 'Utilization') {
                definition = `${definition} ${defineMetricTarget(spec.resource.target)}`;
                if (
                  status?.resource?.current?.averageUtilization !== undefined &&
                  status.resource.current.averageUtilization !== null
                ) {
                  const avgUtil = status.resource.current.averageUtilization;
                  const avgVal = status.resource.current.averageValue ?? t('translation|<unknown>');
                  value = `${avgUtil}% (${avgVal})/${metricTargetValue(spec.resource.target)}`;
                  shortValue = `${avgUtil}% /${metricTargetValue(spec.resource.target)}`;
                } else {
                  value = `${t('translation|<unknown>')}/${metricTargetValue(
                    spec.resource.target
                  )}`;
                  shortValue = `${t('translation|<unknown>')}/${metricTargetValue(
                    spec.resource.target
                  )}`;
                }
              }
              metrics.push({
                name: spec.resource.name,
                definition,
                value,
                shortValue: shortValue,
              });
            }
          }
          break;
        case 'ContainerResource':
          {
            if (spec.containerResource) {
              const value = `${
                status && status.containerResource
                  ? metricValueStatus(
                      status.containerResource.current,
                      t,
                      spec.containerResource.target
                    )
                  : t('translation|<unknown>')
              }/${metricTargetValue(spec.containerResource.target)}`;
              const definition = t(
                'translation|resource {{resourceName}} of container {{containerName}} on pods',
                {
                  resourceName: spec.containerResource.name,
                  containerName: spec.containerResource.container,
                }
              );
              metrics.push({
                name: spec.containerResource.name,
                definition,
                value,
                shortValue: value,
              });
            }
          }
          break;
      }
    }
    return metrics;
  }

  get referenceObject(): KubeObject | null {
    const target = this.jsonData.spec?.scaleTargetRef;
    if (!target) {
      return null;
    }

    const TargetObjectClass = (ResourceClasses as Record<string, KubeObjectClass>)[target.kind];
    let objInstance: KubeObject | null = null;
    if (!!TargetObjectClass) {
      objInstance = new TargetObjectClass({
        kind: target.kind,
        metadata: {
          name: target.name,
          namespace: this.getNamespace(),
        } as KubeMetadata,
      });
    }

    return objInstance;
  }
}

export default HPA;

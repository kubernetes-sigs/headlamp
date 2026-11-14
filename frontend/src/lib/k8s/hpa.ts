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

import type { KubeMetadata } from './KubeMetadata';
import { KubeObject, type KubeObjectClass, type KubeObjectInterface } from './KubeObject';
import { ResourceClasses } from './resourceClasses';
export interface CrossVersionObjectReference {
  apiVersion: string;
  kind: string;
  name: string;
}

interface MetricLabelSelector {
  matchLabels?: {
    [key: string]: string;
  };
  matchExpressions?: {
    key: string;
    operator: string;
    // Exists and DoesNotExist requirements omit values entirely.
    values?: string[];
  }[];
}

interface MetricIdentifier {
  name: string;
  selector?: MetricLabelSelector;
}

interface MetricValueStatus {
  averageUtilization?: number;
  averageValue?: string;
  value?: string;
}

function metricValueStatus(
  status: MetricValueStatus,
  t: Function,
  targetType?: MetricType
): string {
  if (targetType === 'Utilization') {
    if (status.averageUtilization !== undefined && status.averageUtilization !== null) {
      return `${status.averageUtilization}%`;
    }
    return t('translation|<unknown>');
  }
  if (targetType === 'AverageValue') {
    if (status.averageValue !== undefined && status.averageValue !== null) {
      return `${status.averageValue}`;
    }
    return t('translation|<unknown>');
  }
  if (targetType === 'Value') {
    if (status.value !== undefined && status.value !== null) {
      return `${status.value}`;
    }
    return t('translation|<unknown>');
  }
  if (status.averageUtilization !== undefined && status.averageUtilization !== null) {
    return `${status.averageUtilization}%`;
  }
  if (status.averageValue !== undefined && status.averageValue !== null) {
    return `${status.averageValue}`;
  }
  if (status.value !== undefined && status.value !== null) {
    return `${status.value}`;
  }
  return t('translation|<unknown>');
}

/**
 * Checks whether a metric status value has the shape expected by the target type.
 */
function matchesTargetType(
  target: MetricTarget | undefined,
  current: MetricValueStatus | undefined
): boolean {
  if (!target || !current) {
    return false;
  }
  switch (target.type) {
    case 'Utilization':
      return current.averageUtilization !== undefined && current.averageUtilization !== null;
    case 'AverageValue':
      return current.averageValue !== undefined && current.averageValue !== null;
    case 'Value':
      return current.value !== undefined && current.value !== null;
    default:
      return false;
  }
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
  minReplicas: number;
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
          describedObject: CrossVersionObjectReference;
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
 * Compares two metric selectors by value rather than by serialization.
 *
 * The API server round-trips selectors between spec and status, so omitted and
 * empty selectors mean the same thing and the requirements in matchLabels and
 * matchExpressions can be written in any order. Two selectors are equal when
 * they require exactly the same labels and expressions, regardless of spelling.
 */
function isSameSelector(a?: MetricLabelSelector, b?: MetricLabelSelector): boolean {
  const aLabels = a?.matchLabels || {};
  const bLabels = b?.matchLabels || {};
  const aLabelKeys = Object.keys(aLabels);
  const bLabelKeys = Object.keys(bLabels);
  if (aLabelKeys.length !== bLabelKeys.length) {
    return false;
  }
  for (const key of aLabelKeys) {
    if (aLabels[key] !== bLabels[key]) {
      return false;
    }
  }

  const aExpressions = a?.matchExpressions || [];
  const bExpressions = b?.matchExpressions || [];
  if (aExpressions.length !== bExpressions.length) {
    return false;
  }

  const normalizeExpression = (expression: {
    key: string;
    operator: string;
    values?: string[];
  }) => ({
    key: expression.key,
    operator: expression.operator,
    // Exists and DoesNotExist requirements omit values; treat that as no
    // values rather than failing to iterate undefined.
    values: [...(expression.values || [])].sort(),
  });

  const aSorted = aExpressions
    .map(normalizeExpression)
    .sort((x, y) =>
      x.key === y.key
        ? x.operator === y.operator
          ? JSON.stringify(x.values).localeCompare(JSON.stringify(y.values))
          : x.operator.localeCompare(y.operator)
        : x.key.localeCompare(y.key)
    );
  const bSorted = bExpressions
    .map(normalizeExpression)
    .sort((x, y) =>
      x.key === y.key
        ? x.operator === y.operator
          ? JSON.stringify(x.values).localeCompare(JSON.stringify(y.values))
          : x.operator.localeCompare(y.operator)
        : x.key.localeCompare(y.key)
    );

  return aSorted.every((expression, index) => {
    const other = bSorted[index];
    return (
      expression.key === other.key &&
      expression.operator === other.operator &&
      expression.values.length === other.values.length &&
      expression.values.every((value, i) => value === other.values[i])
    );
  });
}

/**
 * Compares two cross-version object references by identity.
 */
function isSameObjectRef(
  a?: CrossVersionObjectReference,
  b?: CrossVersionObjectReference
): boolean {
  return (
    (a?.apiVersion || '') === (b?.apiVersion || '') &&
    (a?.kind || '') === (b?.kind || '') &&
    (a?.name || '') === (b?.name || '')
  );
}

/**
 * Picks the status entry that reports a given spec metric.
 *
 * `status.currentMetrics` lists only the metrics the HPA controller managed to
 * read, so a metric that failed is absent and the entries after it shift left.
 * Matching by position therefore pairs a spec metric with an unrelated status
 * entry, which silently shows another metric's values. The entries have to be
 * matched by the identity the controller writes them with: the source type plus
 * the resource, container, metric name, metric selector or described object
 * they refer to, as well as the expected current-value shape for the target type.
 */
function findCurrentMetric(
  spec: HpaSpec['metrics'][number],
  currentMetrics: HpaStatus['currentMetrics']
) {
  return currentMetrics?.find(status => {
    if (status.type !== spec.type) {
      return false;
    }
    if (spec.resource) {
      return (
        status.resource?.name === spec.resource.name &&
        matchesTargetType(spec.resource.target, status.resource?.current)
      );
    }
    if (spec.containerResource) {
      return (
        status.containerResource?.name === spec.containerResource.name &&
        status.containerResource?.container === spec.containerResource.container &&
        matchesTargetType(spec.containerResource.target, status.containerResource?.current)
      );
    }
    if (spec.pods) {
      return (
        status.pods?.metric?.name === spec.pods.metric?.name &&
        isSameSelector(status.pods.metric?.selector, spec.pods.metric?.selector) &&
        matchesTargetType(spec.pods.target, status.pods?.current)
      );
    }
    if (spec.object) {
      return (
        status.object?.metric?.name === spec.object.metric?.name &&
        isSameSelector(status.object.metric?.selector, spec.object.metric?.selector) &&
        isSameObjectRef(status.object?.describedObject, spec.object.describedObject) &&
        matchesTargetType(spec.object.target, status.object?.current)
      );
    }
    if (spec.external) {
      return (
        status.external?.metric?.name === spec.external.metric?.name &&
        isSameSelector(status.external.metric?.selector, spec.external.metric?.selector) &&
        matchesTargetType(spec.external.target, status.external?.current)
      );
    }
    return false;
  });
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
    for (let iter = 0; iter < specMetrics.length; iter++) {
      const spec = specMetrics[iter];
      const status = findCurrentMetric(spec, this.status?.currentMetrics);
      switch (spec.type) {
        case 'External':
          {
            if (spec.external) {
              const value = `${
                status && status.external
                  ? metricValueStatus(status.external.current, t, spec.external.target.type)
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
                  ? metricValueStatus(status.object.current, t, spec.object.target.type)
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
                  ? metricValueStatus(status.pods.current, t, spec.pods.target.type)
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
                    ? metricValueStatus(status.resource.current, t, spec.resource.target.type)
                    : t('translation|<unknown>')
                }/${metricTargetValue(spec.resource.target)}`;
                shortValue = `${
                  status && status.resource
                    ? metricValueStatus(status.resource.current, t, spec.resource.target.type)
                    : t('translation|<unknown>')
                }/${metricTargetValue(spec.resource.target)}`;
              }
              if (spec.resource.target.type === 'Utilization') {
                definition = `${definition} ${defineMetricTarget(spec.resource.target)}`;
                if (
                  status &&
                  status.resource &&
                  status.resource.current.averageUtilization !== undefined &&
                  status.resource.current.averageUtilization !== null
                ) {
                  const currentUtil = status.resource.current.averageUtilization;
                  const currentAvg =
                    status.resource.current.averageValue !== undefined &&
                    status.resource.current.averageValue !== null
                      ? status.resource.current.averageValue
                      : t('translation|<unknown>');
                  value = `${currentUtil}% (${currentAvg})/${metricTargetValue(
                    spec.resource.target
                  )}`;
                  shortValue = `${currentUtil}% /${metricTargetValue(spec.resource.target)}`;
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
                      spec.containerResource.target.type
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

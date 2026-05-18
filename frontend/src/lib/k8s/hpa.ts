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

import { ResourceClasses } from '.';
import type { KubeMetadata } from './KubeMetadata';
import { KubeObject, type KubeObjectClass, type KubeObjectInterface } from './KubeObject';
export interface CrossVersionObjectReference {
  apiVersion: string;
  kind: string;
  name: string;
}

interface MetricIdentifier {
  name: string;
  selector: {
    matchLabels: {
      [key: string]: string;
    };
    matchExpressions: {
      key: string;
      operator: string;
      values: string[];
    };
  };
}

interface MetricValueStatus {
  averageUtilization?: number;
  averageValue?: string;
  value?: string;
}

function metricValueStatus(status: MetricValueStatus, t: Function): string {
  if (status.averageUtilization) {
    return `${status.averageUtilization}%`;
  }
  if (status.averageValue) {
    return `${status.averageValue}`;
  }
  if (status.value) {
    return `${status.value}`;
  }
  return t('translation|<unknown>');
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
      if (target.averageUtilization) {
        return `${target.averageUtilization.toString()}%`;
      }
      return '';
      break;
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
          desiredObject: CrossVersionObjectReference;
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
    for (let iter = 0; iter < this.spec.metrics.length; iter++) {
      const spec = this.spec.metrics[iter];
      const status = this.status.currentMetrics?.[iter];
      switch (spec.type) {
        case 'External':
          {
            if (spec.external) {
              const value = `${
                status && status.external
                  ? metricValueStatus(status.external.current, t)
                  : t('translation|<unknown>')
              }/${metricTargetValue(spec.external.target)}`;
              const definition = `"${spec.external.metric.name}" ${defineMetricTarget(
                spec.external.target
              )}`;
              metrics.push({
                name: spec.external.metric.name,
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
                  ? metricValueStatus(status.object.current, t)
                  : t('translation|<unknown>')
              }/${metricTargetValue(spec.object.target)}`;
              const definition = t(
                'translation|"{{metricName}}" on {{objectKind}}/{{objectName}} {{metricTarget}}',
                {
                  metricName: spec.object.metric.name,
                  objectKind: spec.object.describedObject.kind,
                  objectName: spec.object.describedObject.name,
                  metricTarget: defineMetricTarget(spec.object.target),
                }
              );
              metrics.push({
                name: spec.object.metric.name,
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
                  ? metricValueStatus(status.pods.current, t)
                  : t('translation|<unknown>')
              }/${metricTargetValue(spec.pods.target)}`;
              const definition = t('translation|"{{metricName}}" on pods', {
                metricName: spec.pods.metric.name,
              });
              metrics.push({
                name: spec.pods.metric.name,
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
                    ? metricValueStatus(status.resource.current, t)
                    : t('translation|<unknown>')
                }/${metricTargetValue(spec.resource.target)}`;
                shortValue = `${
                  status && status.resource
                    ? metricValueStatus(status.resource.current, t)
                    : t('translation|<unknown>')
                }/${metricTargetValue(spec.resource.target)}`;
              }
              if (spec.resource.target.type === 'Utilization') {
                definition = `${definition} ${defineMetricTarget(spec.resource.target)}`;
                if (status) {
                  value = `${
                    status.resource
                      ? status.resource.current.averageUtilization
                      : t('translation|<unknown>')
                  }% (${
                    status.resource
                      ? status.resource.current.averageValue
                      : t('translation|<unknown>')
                  })/${metricTargetValue(spec.resource.target)}`;
                  shortValue = `${
                    status.resource
                      ? status.resource.current.averageUtilization
                      : t('translation|<unknown>')
                  }% /${metricTargetValue(spec.resource.target)}`;
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
                  ? metricValueStatus(status.containerResource.current, t)
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

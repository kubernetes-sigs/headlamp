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
import { apiFactory, apiFactoryWithNamespace } from './api/v1/factories';
import type { KubeObjectClass, KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeCRD extends KubeObjectInterface {
  spec: {
    group: string;
    version: string;
    names: {
      plural: string;
      singular: string;
      kind: string;
      listKind: string;
      categories?: string[];
    };
    versions: {
      name: string;
      served: boolean;
      storage: boolean;
      additionalPrinterColumns: {
        name: string;
        type: string;
        jsonPath: string;
        description?: string;
        priority?: number;
        format?: string;
      }[];
    }[];
    scope: string;
    [other: string]: any;
  };
  status?: {
    acceptedNames?: {
      kind: string;
      plural: string;
      shortNames: string[];
      categories?: string[];
    };
    conditions?: {
      type: string;
      status: string;
      lastTransitionTime: string;
      reason: string;
      message: string;
    }[];
    storedVersions?: string[];
  };
}

class CustomResourceDefinition extends KubeObject<KubeCRD> {
  static kind = 'CustomResourceDefinition';
  static apiName = 'customresourcedefinitions';
  static apiVersion = ['apiextensions.k8s.io/v1', 'apiextensions.k8s.io/v1beta1'];
  static isNamespaced = false;

  static readOnlyFields = ['metadata.managedFields'];

  static get listRoute(): string {
    return 'crds';
  }

  static get detailsRoute(): string {
    return 'crd';
  }

  get spec(): KubeCRD['spec'] {
    return this.jsonData.spec;
  }

  get status(): KubeCRD['status'] {
    return this.jsonData.status;
  }

  get plural(): string {
    return this.spec.names.plural;
  }

  getMainAPIGroup(): [string, string, string] {
    const group = this.spec.group;
    let version = this.spec.version;
    const name = this.spec.names.plural as string;

    // Assign the 1st storage version if no version is specified,
    // or the 1st served version if no storage version is specified.
    if (!version && this.spec.versions.length > 0) {
      for (const versionItem of this.spec.versions) {
        if (!!versionItem.storage) {
          version = versionItem.name;
          break;
        } else if (!version) {
          version = versionItem.name;
        }
      }
    }

    return [group, version, name];
  }

  get isNamespacedScope(): boolean {
    return this.spec.scope === 'Namespaced';
  }

  makeCRClass(): typeof KubeObject<KubeCRD> {
    const apiInfo: CRClassArgs['apiInfo'] = (this.jsonData as KubeCRD).spec.versions.map(
      versionInfo => ({ group: this.spec.group, version: versionInfo.name })
    );

    return makeCustomResourceClass({
      apiInfo,
      isNamespaced: this.spec.scope === 'Namespaced',
      singularName: this.spec.names.singular,
      pluralName: this.spec.names.plural,
      customResourceDefinition: this,
      kind: this.spec.names.kind,
    });
  }

  getCategories() {
    return this.status?.acceptedNames?.categories ?? [];
  }
}

export interface CRClassArgs {
  apiInfo: {
    group: string;
    version: string;
  }[];
  kind: string;
  pluralName: string;
  singularName: string;
  isNamespaced: boolean;
  customResourceDefinition?: CustomResourceDefinition;
}

/** @deprecated Use the version of the function that receives an object as its argument. */
export function makeCustomResourceClass(
  args: [group: string, version: string, pluralName: string][],
  isNamespaced: boolean
): KubeObjectClass;
export function makeCustomResourceClass(args: CRClassArgs): KubeObjectClass;
export function makeCustomResourceClass(
  args: [group: string, version: string, pluralName: string][] | CRClassArgs,
  isNamespaced?: boolean
): KubeObjectClass {
  let apiInfoArgs: [group: string, version: string, pluralName: string][] = [];

  if (Array.isArray(args)) {
    apiInfoArgs = args;
  } else {
    apiInfoArgs = args.apiInfo.map(info => [info.group, info.version, args.pluralName]);
  }

  // Used for tests
  if (import.meta.env.UNDER_TEST || import.meta.env.STORYBOOK) {
    const knownClass = (ResourceClasses as Record<string, KubeObjectClass>)[apiInfoArgs[0][2]];
    if (!!knownClass) {
      return knownClass;
    }
  }

  const crClassArgs = args as CRClassArgs;
  const objArgs = {
    isNamespaced: !!isNamespaced || crClassArgs.isNamespaced,
    singleName: crClassArgs.singularName || 'crd',
  };

  const apiFunc = !!objArgs.isNamespaced ? apiFactoryWithNamespace : apiFactory;
  return class CRClass extends KubeObject<any> {
    static kind = crClassArgs.kind;
    static apiName = crClassArgs.pluralName;
    static apiVersion = apiInfoArgs.map(([group, version]) =>
      group ? `${group}/${version}` : version
    );
    static isNamespaced = objArgs.isNamespaced;
    static apiEndpoint = apiFunc(...apiInfoArgs);
    static customResourceDefinition = crClassArgs.customResourceDefinition;

    static getBaseObject(): Omit<KubeObjectInterface, 'metadata'> & {
      metadata: Partial<import('./KubeMetadata').KubeMetadata>;
    } {
      // For custom resources - use the storage version from the CRD if available,
      // otherwise fall back to the first apiInfo entry
      let group: string;
      let version: string;
      if (crClassArgs.customResourceDefinition) {
        [group, version] = crClassArgs.customResourceDefinition.getMainAPIGroup();
      } else {
        if (!apiInfoArgs.length) {
          throw new Error(
            'makeCustomResourceClass requires at least one apiInfo entry when customResourceDefinition is not provided'
          );
        }
        [group, version] = apiInfoArgs[0];
      }
      const apiVersion = group ? `${group}/${version}` : version;

      return {
        apiVersion,
        kind: this.kind,
        metadata: {
          name: '',
        },
      };
    }
  };
}

export default CustomResourceDefinition;

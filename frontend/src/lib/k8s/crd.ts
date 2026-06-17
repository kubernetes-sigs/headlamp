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
import {
  describeMissingField,
  resolveCRDApiGroup,
  selectMainAPIGroup,
  validateCRDSpec,
} from './crdSpec';
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

  /**
   * Returns the CRD's plural name. Falls back to `''` when the spec hasn't
   * fully arrived yet (#4824) to preserve backward compatibility with callers
   * that treat it as a required `string`. For an explicit "incomplete CRD"
   * signal, prefer `getMainAPIGroupOrNull()` which returns `null` in that case.
   */
  get plural(): string {
    return this.spec?.names?.plural ?? '';
  }

  /**
   * Returns [group, version, plural] for this CRD. Preserves the original
   * non-nullable signature for plugin/library consumers; returns `['', '', '']`
   * when the spec is incomplete. New callers should prefer
   * `getMainAPIGroupOrNull()` which signals the incomplete state explicitly.
   */
  getMainAPIGroup(): [string, string, string] {
    return selectMainAPIGroup(this.spec) ?? ['', '', ''];
  }

  /**
   * Returns [group, version, plural] for this CRD, or `null` when the spec is
   * incomplete (missing group, plural, or any usable version). Use this in
   * preference to `getMainAPIGroup()` when the caller needs to distinguish
   * "incomplete CRD" from a CRD that genuinely has empty fields (#4824).
   */
  getMainAPIGroupOrNull(): [string, string, string] | null {
    return selectMainAPIGroup(this.spec);
  }

  get isNamespacedScope(): boolean {
    return this.spec?.scope === 'Namespaced';
  }

  /**
   * Constructs the dynamic class for this CRD's custom resources. Preserves
   * the original non-nullable signature for plugin/library consumers; throws
   * a clear error when the spec is incomplete so callers see the same kind of
   * failure they'd see before #4824 instead of an unexpected `null`.
   * New callers should prefer `makeCRClassOrNull()`, which signals the
   * incomplete state without throwing.
   */
  makeCRClass(): typeof KubeObject<KubeCRD> {
    const spec = (this.jsonData as KubeCRD)?.spec;
    const validation = validateCRDSpec(spec);
    if (!validation.ok || !spec) {
      // Defensive fallback in case `validation.missing` is somehow empty
      // (e.g. a future change to `validateCRDSpec` skips the per-field
      // pushes for an `undefined` spec): an empty list in the rendered
      // message reads as a bug, so substitute a generic description.
      const issues =
        validation.missing.length === 0
          ? 'spec is missing'
          : validation.missing.map(describeMissingField).join(', ');
      throw new Error(
        `CustomResourceDefinition "${
          this.metadata?.name ?? '<unknown>'
        }" has an incomplete spec (missing or invalid: ${issues}). ` +
          `Use makeCRClassOrNull() if a null return is expected.`
      );
    }
    return this.buildCRClass(spec, validation.usableVersions);
  }

  /**
   * Same construction logic as `makeCRClass()` but returns `null` instead of
   * throwing when the CRD spec is incomplete. Prefer this in any code path
   * that wants to render a non-error UI state for partially-loaded or
   * malformed CRDs (#4824). Pure: no logging side effect, safe to call from
   * render paths (`useMemo`, etc).
   */
  makeCRClassOrNull(): typeof KubeObject<KubeCRD> | null {
    const spec = (this.jsonData as KubeCRD)?.spec;
    const validation = validateCRDSpec(spec);
    if (!validation.ok || !spec) {
      return null;
    }
    return this.buildCRClass(spec, validation.usableVersions);
  }

  /**
   * Internal: constructs the dynamic class from an already-validated spec.
   * Both `makeCRClass()` and `makeCRClassOrNull()` validate once and route
   * through this helper, so the construction logic isn't duplicated and
   * validation isn't repeated on the error path.
   */
  private buildCRClass(
    spec: KubeCRD['spec'],
    usableVersions: ReturnType<typeof validateCRDSpec>['usableVersions']
  ): typeof KubeObject<KubeCRD> {
    const apiInfo: CRClassArgs['apiInfo'] = usableVersions.length
      ? usableVersions.map(versionInfo => ({ group: spec.group, version: versionInfo.name }))
      : [{ group: spec.group, version: spec.version }];

    return makeCustomResourceClass({
      apiInfo,
      isNamespaced: spec.scope === 'Namespaced',
      singularName: spec.names.singular || spec.names.kind.toLowerCase(),
      pluralName: spec.names.plural,
      customResourceDefinition: this,
      kind: spec.names.kind,
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
      const apiGroup = resolveCRDApiGroup(crClassArgs.customResourceDefinition);
      if (apiGroup) {
        [group, version] = apiGroup;
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

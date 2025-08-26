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

import { JSONPath } from 'jsonpath-plus';
import cloneDeep from 'lodash/cloneDeep';
import unset from 'lodash/unset';
import React, { useMemo } from 'react';
import { loadClusterSettings } from '../../helpers/clusterSettings';
import { formatClusterPathParam, getCluster, getSelectedClusters } from '../cluster';
import { createRouteURL } from '../router/createRouteURL';
import { timeAgo } from '../util';
import { useConnectApi, useSelectedClusters } from '.';
import { post } from './api/v1/clusterRequests';
import type { DeleteParameters } from './api/v1/deleteParameters';
import type { RecursivePartial } from './api/v1/factories';
import { apiFactory, apiFactoryWithNamespace } from './api/v1/factories';
import type { QueryParameters } from './api/v1/queryParameters';
import type { ApiError } from './api/v2/ApiError';
import { useKubeObject } from './api/v2/hooks';
import { makeListRequests, useKubeObjectList } from './api/v2/useKubeObjectList';
import type { KubeEvent } from './event';
import type { KubeMetadata } from './KubeMetadata';

function getAllowedNamespaces(cluster: string | null = getCluster()): string[] {
  if (!cluster) {
    return [];
  }

  const clusterSettings = loadClusterSettings(cluster);
  return clusterSettings.allowedNamespaces || [];
}

export class KubeObject<T extends KubeObjectInterface | KubeEvent = any> {
  jsonData: T;
  /** Readonly field defined as JSONPath paths */
  static readOnlyFields: string[] = [];
  _clusterName: string;

  /** The kind of the object. Corresponding to the resource kind in Kubernetes. */
  static readonly kind: string;

  /** Name of the resource, plural, used in API */
  static readonly apiName: string;

  /** Group and version of the resource formatted as "GROUP/VERSION", e.g. "policy.k8s.io/v1". */
  static readonly apiVersion: string | string[];

  /** Whether the object is namespaced. */
  static readonly isNamespaced: boolean;

  static _internalApiEndpoint?: ReturnType<typeof apiFactoryWithNamespace | typeof apiFactory>;

  static get apiEndpoint() {
    if (this._internalApiEndpoint) return this._internalApiEndpoint;

    const factory = this.isNamespaced ? apiFactoryWithNamespace : apiFactory;
    const versions = Array.isArray(this.apiVersion) ? this.apiVersion : [this.apiVersion];

    // Create factory arguments per API version, usually just one
    const factoryArgumentsArray = versions.map(apiVersion => {
      const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];
      const includeScaleApi = ['Deployment', 'ReplicaSet', 'StatefulSet'].includes(this.kind);

      return [group, version, this.apiName, includeScaleApi];
    });

    // Extract the first argument list if we only have one version
    // Because for resources with only one API version
    // the factory expects flat arguments instead of an array
    const factoryArguments =
      factoryArgumentsArray.length === 1
        ? factoryArgumentsArray[0]
        : (factoryArgumentsArray as any);

    const endpoint = factory(...factoryArguments);
    this._internalApiEndpoint = endpoint;

    return endpoint;
  }
  static set apiEndpoint(endpoint: ReturnType<typeof apiFactoryWithNamespace | typeof apiFactory>) {
    this._internalApiEndpoint = endpoint;
  }

  constructor(json: T, cluster?: string) {
    this.jsonData = json;
    this._clusterName = cluster || getCluster() || '';
  }

  get cluster(): string {
    return this._clusterName;
  }

  set cluster(cluster: string) {
    this._clusterName = cluster;
  }

  static get className(): string {
    return this.kind;
  }

  get detailsRoute(): string {
    return this._class().detailsRoute;
  }

  static get detailsRoute(): string {
    return this.kind;
  }

  static get pluralName(): string {
    // This is a naive way to get the plural name of the object by default. It will
    // work in most cases, but for exceptions (like Ingress), we must override this.
    return this.apiName;
  }

  get pluralName(): string {
    // In case we need to override the plural name in instances.
    return this._class().pluralName;
  }

  get listRoute(): string {
    return this._class().listRoute;
  }

  static get listRoute(): string {
    return this.apiName;
  }

  get kind() {
    return this.jsonData.kind;
  }

  getDetailsLink() {
    const selectedClusters = getSelectedClusters();

    const cluster = formatClusterPathParam(selectedClusters, this.cluster);

    const params = {
      namespace: this.getNamespace(),
      name: this.getName(),
      cluster,
    };
    const link = createRouteURL(this.detailsRoute, params);
    return link;
  }

  getListLink() {
    return createRouteURL(this.listRoute);
  }

  getName() {
    return this.metadata.name;
  }

  getNamespace() {
    return this.metadata.namespace;
  }

  getCreationTs() {
    return this.metadata.creationTimestamp;
  }

  getAge() {
    return timeAgo(this.getCreationTs());
  }

  getValue(prop: string) {
    return (this.jsonData as Record<string, any>)![prop];
  }

  get metadata() {
    return this.jsonData.metadata;
  }

  get isNamespaced() {
    return this._class().isNamespaced;
  }

  getEditableObject() {
    const fieldsToRemove = this._class().readOnlyFields;
    const code = this.jsonData ? cloneDeep(this.jsonData) : {};

    fieldsToRemove?.forEach(path => {
      JSONPath({
        path,
        json: code,
        callback: (result, type, fullPayload) => {
          if (fullPayload.parent && fullPayload.parentProperty) {
            delete fullPayload.parent[fullPayload.parentProperty];
          }
        },
        resultType: 'all',
      });
    });

    return code;
  }

  // @todo: apiList has 'any' return type.
  /**
   * Returns the API endpoint for this object.
   *
   * @param onList - Callback function to be called when the list is retrieved.
   * @param onError - Callback function to be called when an error occurs.
   * @param opts - Options to be passed to the API endpoint.
   *
   * @returns The API endpoint for this object.
   */
  static apiList<K extends KubeObject>(
    this: (new (...args: any) => K) & typeof KubeObject<any>,
    onList: (arg: K[]) => void,
    onError?: (err: ApiError, cluster?: string) => void,
    opts?: ApiListSingleNamespaceOptions
  ) {
    const createInstance = (item: any): any => this.create(item);

    const args: any[] = [(list: any[]) => onList(list.map((item: any) => createInstance(item)))];

    if (this.apiEndpoint.isNamespaced) {
      args.unshift(opts?.namespace || null);
    }

    args.push(onError);

    const queryParams: QueryParameters = {};
    if (opts?.queryParams?.labelSelector) {
      queryParams['labelSelector'] = opts.queryParams.labelSelector;
    }
    if (opts?.queryParams?.fieldSelector) {
      queryParams['fieldSelector'] = opts.queryParams.fieldSelector;
    }
    if (opts?.queryParams?.limit) {
      queryParams['limit'] = opts.queryParams.limit;
    }
    args.push(queryParams);

    args.push(opts?.cluster);

    return this.apiEndpoint.list.bind(null, ...args);
  }

  static useApiList<K extends KubeObject>(
    this: (new (...args: any) => K) & typeof KubeObject<any>,
    onList: (...arg: any[]) => any,
    onError?: (err: ApiError, cluster?: string) => void,
    opts?: ApiListOptions
  ) {
    const [objs, setObjs] = React.useState<{ [key: string]: K[] }>({});
    const listCallback = onList as (arg: any[]) => void;

    function onObjs(namespace: string, objList: K[]) {
      let newObjs: typeof objs = {};
      // Set the objects so we have them for the next API response...
      setObjs(previousObjs => {
        newObjs = { ...previousObjs, [namespace || '']: objList };
        return newObjs;
      });

      let allObjs: K[] = [];
      Object.values(newObjs).map(currentObjs => {
        allObjs = allObjs.concat(currentObjs);
      });

      listCallback(allObjs);
    }

    const listCalls = [];
    const queryParams = cloneDeep(opts);
    let namespaces: string[] = [];
    unset(queryParams, 'namespace');

    const cluster = opts?.cluster;

    if (!!opts?.namespace) {
      if (typeof opts.namespace === 'string') {
        namespaces = [opts.namespace];
      } else if (Array.isArray(opts.namespace)) {
        namespaces = opts.namespace as string[];
      } else {
        throw Error('namespace should be a string or array of strings');
      }
    }

    // If the request itself has no namespaces set, we check whether to apply the
    // allowed namespaces.
    if (namespaces.length === 0 && this.isNamespaced) {
      namespaces = getAllowedNamespaces();
    }

    if (namespaces.length > 0) {
      // If we have a namespace set, then we have to make an API call for each
      // namespace and then set the objects once we have all of the responses.
      for (const namespace of namespaces) {
        listCalls.push(
          this.apiList(objList => onObjs(namespace, objList as K[]), onError, {
            namespace,
            queryParams,
            cluster,
          })
        );
      }
    } else {
      // If we don't have a namespace set, then we only have one API call
      // response to set and we return it right away.
      listCalls.push(this.apiList(listCallback, onError, { queryParams, cluster }));
    }

    useConnectApi(...listCalls);
  }

  static useList<K extends KubeObject>(
    this: (new (...args: any) => K) & typeof KubeObject<any>,
    {
      cluster,
      clusters,
      namespace,
      refetchInterval,
      ...queryParams
    }: {
      cluster?: string;
      clusters?: string[];
      namespace?: string | string[];
      /** How often to refetch the list. Won't refetch by default. Disables watching if set. */
      refetchInterval?: number;
    } & QueryParameters = {}
  ) {
    const fallbackClusters = useSelectedClusters();

    // Create requests for each cluster and namespace
    const requests = useMemo(() => {
      const clusterList = cluster
        ? [cluster]
        : clusters || (fallbackClusters.length === 0 ? [''] : fallbackClusters);

      const namespacesFromParams =
        typeof namespace === 'string'
          ? [namespace]
          : Array.isArray(namespace)
          ? namespace
          : undefined;

      return makeListRequests(
        clusterList,
        getAllowedNamespaces,
        this.isNamespaced,
        namespacesFromParams
      );
    }, [cluster, clusters, fallbackClusters, namespace, this.isNamespaced]);

    const result = useKubeObjectList<K>({
      queryParams: queryParams,
      kubeObjectClass: this,
      requests,
      refetchInterval,
    });

    return result;
  }

  static useGet<K extends KubeObject>(
    this: new (...args: any) => K,
    name: string,
    namespace?: string,
    opts?: {
      queryParams?: QueryParameters;
      cluster?: string;
    }
  ) {
    return useKubeObject<K>({
      kubeObjectClass: this as (new (...args: any) => K) & typeof KubeObject<any>,
      name: name,
      namespace: namespace,
      cluster: opts?.cluster,
      queryParams: opts?.queryParams,
    });
  }

  static create<Args extends any[], T extends KubeObject>(
    this: new (...args: Args) => T,
    ...item: Args
  ) {
    return new this(...item) as T;
  }

  static apiGet<K extends KubeObject>(
    this: (new (...args: any) => K) & typeof KubeObject<any>,
    onGet: (...args: any) => void,
    name: string,
    namespace?: string,
    onError?: (err: ApiError | null, cluster?: string) => void,
    opts?: {
      queryParams?: QueryParameters;
      cluster?: string;
    }
  ) {
    const createInstance = (item: any) => this.create(item);
    const args: any[] = [name, (obj: any) => onGet(createInstance(obj))];

    if (this.apiEndpoint.isNamespaced) {
      args.unshift(namespace);
    }

    args.push(onError);
    args.push(opts?.queryParams);
    args.push(opts?.cluster);

    return this.apiEndpoint.get.bind(null, ...args);
  }

  static useApiGet<K extends KubeObject>(
    this: (new (...args: any) => K) & typeof KubeObject<any>,
    onGet: (item: K | null) => any,
    name: string,
    namespace?: string,
    onError?: (err: ApiError | null, cluster?: string) => void,
    opts?: {
      queryParams?: QueryParameters;
      cluster?: string;
    }
  ) {
    // We do the type conversion here because we want to be able to use hooks that may not have
    // the exact signature as get callbacks.
    const getCallback = onGet as (item: K) => void;
    useConnectApi(this.apiGet(getCallback, name, namespace, onError, opts));
  }

  _class() {
    return this.constructor as KubeObjectClass;
  }

  delete(force?: boolean) {
    const args: string[] = [this.getName()];
    if (this.isNamespaced) {
      args.unshift(this.getNamespace()!);
    }
    const params: DeleteParameters = {};

    console.log(force);
    if (force) {
      params.gracePeriodSeconds = 0;
      console.log(params);
    }

    // @ts-ignore
    return this._class().apiEndpoint.delete(...args, params, this._clusterName);
  }

  update(data: KubeObjectInterface) {
    return this._class().apiEndpoint.put(data, {}, this._clusterName);
  }

  static put(data: KubeObjectInterface) {
    return this.apiEndpoint.put(data);
  }

  scale(numReplicas: number) {
    const hasScaleApi = Object.keys(this._class().apiEndpoint).includes('scale');
    if (!hasScaleApi) {
      throw new Error(`This class has no scale API: ${this._class().className}`);
    }

    const spec = {
      replicas: numReplicas,
    };

    type ApiEndpointWithScale = {
      scale: {
        patch: (
          body: { spec: { replicas: number } },
          metadata: KubeMetadata,
          clusterName?: string
        ) => Promise<any>;
      };
    };

    return (this._class().apiEndpoint as ApiEndpointWithScale).scale.patch(
      {
        spec,
      },
      this.metadata,
      this._clusterName
    );
  }

  patch(body: RecursivePartial<T>) {
    const args: any[] = [body];

    if (this.isNamespaced) {
      args.push(this.getNamespace());
    }

    args.push(this.getName());

    // @ts-ignore
    return this._class().apiEndpoint.patch(...args, {}, this._clusterName);
  }

  /** Performs a request to check if the user has the given permission.
   * @param reResourceAttrs The attributes describing this access request. See https://kubernetes.io/docs/reference/kubernetes-api/authorization-resources/self-subject-access-review-v1/#SelfSubjectAccessReviewSpec .
   * @returns The result of the access request.
   */
  static async fetchAuthorization(reqResourseAttrs?: AuthRequestResourceAttrs, cluster?: string) {
    // @todo: We should get the API info from the API endpoint.
    const authApiVersions = ['v1', 'v1beta1'];
    for (let j = 0; j < authApiVersions.length; j++) {
      const authVersion = authApiVersions[j];

      try {
        return await post(
          `/apis/authorization.k8s.io/${authVersion}/selfsubjectaccessreviews`,
          {
            kind: 'SelfSubjectAccessReview',
            apiVersion: `authorization.k8s.io/${authVersion}`,
            spec: {
              resourceAttributes: reqResourseAttrs,
            },
          },
          false,
          { cluster }
        );
      } catch (err) {
        // If this is the last attempt or the error is not 404, let it throw.
        if ((err as ApiError).status !== 404 || j === authApiVersions.length - 1) {
          throw err;
        }
      }
    }
  }

  static async getAuthorization(
    verb: string,
    reqResourseAttrs?: AuthRequestResourceAttrs,
    cluster?: string
  ) {
    const resourceAttrs: AuthRequestResourceAttrs = {
      verb,
      ...reqResourseAttrs,
    };

    if (!resourceAttrs.resource) {
      resourceAttrs['resource'] = this.apiName;
    }

    // @todo: We should get the API info from the API endpoint.

    // If we already have the group and version, then we can make the request without
    // trying the API info, which may have several versions and thus be less optimal.
    if (!!resourceAttrs.group && !!resourceAttrs.version && !!resourceAttrs.resource) {
      return this.fetchAuthorization(resourceAttrs, cluster);
    }

    // If we don't have the group or version, then we have to try all of the
    // API info versions until we find one that works.
    const apiInfo = this.apiEndpoint.apiInfo;
    for (let i = 0; i < apiInfo.length; i++) {
      const { group, version } = apiInfo[i];
      // The group and version are tied, so we take both if one is missing.
      const attrs = { ...resourceAttrs, group: group, version: version };

      let authResult;

      try {
        authResult = await this.fetchAuthorization(attrs, cluster);
      } catch (err) {
        // If this is the last attempt or the error is not 404, let it throw.
        if ((err as ApiError).status !== 404 || i === apiInfo.length - 1) {
          throw err;
        }
      }

      if (!!authResult) {
        return authResult;
      }
    }
  }

  async getAuthorization(verb: string, reqResourseAttrs?: AuthRequestResourceAttrs) {
    const resourceAttrs: AuthRequestResourceAttrs = {
      name: this.getName(),
      verb,
      ...reqResourseAttrs,
    };

    const namespace = this.getNamespace();
    if (!resourceAttrs.namespace && !!namespace) {
      resourceAttrs['namespace'] = namespace;
    }

    // Set up the group and version from the object's API version.
    let [group, version] = this.jsonData?.apiVersion?.split('/') ?? [];
    if (!version) {
      version = group;
      group = '';
    }

    if (!!group) {
      resourceAttrs['group'] = group;
    }
    if (!!version) {
      resourceAttrs['version'] = version;
    }

    return this._class().getAuthorization(verb, resourceAttrs, this.cluster);
  }

  static getErrorMessage(err: ApiError | null) {
    if (!err) {
      return null;
    }

    switch (err.status) {
      case 404:
        return 'Error: Not found';
      case 403:
        return 'Error: No permissions';
      default:
        return 'Error';
    }
  }

  static getBaseObject(): Omit<KubeObjectInterface, 'metadata'> & {
    metadata: Partial<KubeMetadata>;
  } {
    return {
      apiVersion: Array.isArray(this.apiVersion) ? this.apiVersion[0] : this.apiVersion,
      kind: this.kind,
      metadata: {
        name: '',
      },
    };
  }
}

/**
 * @deprecated This function is no longer recommended, it's kept for backwards compatibility.
 * Please extend KubeObject instead
 *
 * @returns A KubeObject implementation for the given object name.
 *
 * @param objectName The name of the object to create a KubeObject implementation for.
 */

export function makeKubeObject<T extends KubeObjectInterface | KubeEvent>() {
  class KubeObjectInternal extends KubeObject<T> {}
  return KubeObjectInternal;
}
/**
 * This type refers to the *class* of a KubeObject.
 */

export type KubeObjectClass = typeof KubeObject<any>;
/**
 * This is the base interface for all Kubernetes resources, i.e. it contains fields
 * that all Kubernetes resources have.
 */

export interface KubeObjectInterface {
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   *
   * In CamelCase.
   *
   * Cannot be updated.
   *
   * @see {@link https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds | more info}
   */
  kind: string;
  apiVersion?: string;
  metadata: KubeMetadata;
  spec?: any;
  status?: any;
  items?: any[];
  actionType?: any;
  lastTimestamp?: string;
  key?: any;
  [otherProps: string]: any;
}
export interface ApiListOptions extends QueryParameters {
  /**
   * The clusters to list objects from. By default uses the current clusters being viewed.
   */
  clusters?: string[];
  /** The namespace to list objects from. */
  namespace?: string | string[];
  /**
   * The cluster to list objects from. By default uses the current cluster being viewed.
   * If clusters is set, then we use that and "cluster" is ignored.
   */
  cluster?: string;
}
export interface ApiListSingleNamespaceOptions {
  /** The namespace to get the object from. */
  namespace?: string;
  /** The parameters to be passed to the API endpoint. */
  queryParams?: QueryParameters;
  /** The cluster to get the object from. By default uses the current cluster being viewed. */
  cluster?: string;
}
export interface AuthRequestResourceAttrs {
  name?: string;
  resource?: string;
  subresource?: string;
  namespace?: string;
  version?: string;
  group?: string;
  verb?: string;
}

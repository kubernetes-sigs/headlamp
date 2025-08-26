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

// @todo: repeatStreamFunc could be improved for performance by remembering when a URL
//       is 404 and not trying it again... and again.

import type { OpPatch } from 'json-patch';
import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { getCluster } from '../../../cluster';
import type { KubeObjectInterface } from '../../KubeObject';
import type { ApiError } from '../v2/ApiError';
import { clusterRequest, patch, post, put, remove } from './clusterRequests';
import type { DeleteParameters } from './deleteParameters';
import { asQuery, getApiRoot } from './formatUrl';
import type { QueryParameters } from './queryParameters';
import { apiScaleFactory, type ScaleApi } from './scaleApi';
import type { StreamErrCb, StreamResultsCb } from './streamingApi';
import { streamResult, streamResultsForCluster } from './streamingApi';

export type CancelFunction = () => void;
export type SingleApiFactoryArguments = [group: string, version: string, resource: string];
export type MultipleApiFactoryArguments = SingleApiFactoryArguments[];
export type ApiFactoryArguments = SingleApiFactoryArguments | MultipleApiFactoryArguments;

export type SimpleApiFactoryWithNamespaceArguments = [
  group: string,
  version: string,
  resource: string,
  includeScale?: boolean
];
export type MultipleApiFactoryWithNamespaceArguments = SimpleApiFactoryWithNamespaceArguments[];
export type ApiFactoryWithNamespaceArguments =
  | SimpleApiFactoryWithNamespaceArguments
  | MultipleApiFactoryWithNamespaceArguments;

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object | undefined
    ? RecursivePartial<T[P]>
    : T[P];
};

export interface ApiClient<ResourceType extends KubeObjectInterface> {
  list: (
    cb: StreamResultsCb<ResourceType>,
    errCb: StreamErrCb,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<CancelFunction>;
  get: (
    name: string,
    cb: StreamResultsCb<ResourceType>,
    errCb: StreamErrCb,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<CancelFunction>;
  post: (
    body: RecursivePartial<ResourceType>,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<ResourceType>;
  put: (
    body: ResourceType,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<ResourceType>;
  patch: (
    body: OpPatch[],
    name: string,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<ResourceType>;
  delete: (name: string, deleteParams?: DeleteParameters, cluster?: string) => Promise<any>;
  isNamespaced: boolean;
  apiInfo: {
    group: string;
    version: string;
    resource: string;
  }[];
}

export interface ApiWithNamespaceClient<ResourceType extends KubeObjectInterface> {
  list: (
    namespace: string,
    cb: StreamResultsCb<ResourceType>,
    errCb: StreamErrCb,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<CancelFunction>;
  get: (
    namespace: string,
    name: string,
    cb: StreamResultsCb<ResourceType>,
    errCb: StreamErrCb,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<CancelFunction>;
  post: (
    body: RecursivePartial<KubeObjectInterface>,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<any>;
  put: (
    body: KubeObjectInterface,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<ResourceType>;
  patch: (
    body: OpPatch[],
    namespace: string,
    name: string,
    queryParams?: QueryParameters,
    cluster?: string
  ) => Promise<any>;
  delete: (
    namespace: string,
    name: string,
    deleteParams?: DeleteParameters,
    cluster?: string
  ) => Promise<any>;
  isNamespaced: boolean;
  apiInfo: {
    group: string;
    version: string;
    resource: string;
  }[];
  scale?: ScaleApi;
}

/**
 * Returns list of object keys, where the value is a function.
 */
type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * Repeats a streaming function call across multiple API endpoints until a
 * successful response is received or all endpoints have been exhausted.
 *
 * This is especially useful for Kubernetes beta APIs that then stabalize.
 * So the APIs are available at different endpoints on different versions of Kubernetes.
 *
 * @param apiEndpoints - An array of API endpoint objects returned by the `apiFactory` function.
 * @param funcName - The name of the streaming function to call on each endpoint.
 * @param errCb - A callback function to handle errors that occur during the streaming function call.
 * @param args - Additional arguments to pass to the streaming function.
 *
 * @returns A function that cancels the streaming function call.
 */
async function repeatStreamFunc<
  ResourceType extends KubeObjectInterface,
  FuncName extends FunctionKeys<ApiClient<ResourceType>>
>(
  apiEndpoints: (ApiClient<ResourceType> | ApiWithNamespaceClient<ResourceType>)[],
  funcName: FuncName,
  errCb: StreamErrCb,
  ...args: any[]
) {
  let isCancelled = false;
  let streamCancel = () => {};

  if (isDebugVerbose('k8s/apiProxy@repeatStreamFunc')) {
    console.debug('k8s/apiProxy@repeatStreamFunc', { apiEndpoints, funcName, args });
  }

  function runStreamFunc(
    endpointIndex: number,
    funcName: FuncName,
    errCb: StreamErrCb,
    ...args: any[]
  ) {
    const endpoint = apiEndpoints[endpointIndex];
    const fullArgs = [...args];
    let errCbIndex = funcName === 'get' ? 2 : 1;
    if (endpoint.isNamespaced) {
      ++errCbIndex;
    }
    fullArgs.splice(errCbIndex, 0, errCb);

    const func: any = endpoint[funcName];

    if (typeof func !== 'function') {
      throw new Error(`The function ${funcName} does not exist on the endpoint`);
    }

    return func(...fullArgs);
  }

  let endpointIndex = 0;
  const cancel: StreamErrCb = async (err, cancelStream) => {
    if (isCancelled) {
      return;
    }
    if (err.status === 404 && endpointIndex < apiEndpoints.length) {
      // Cancel current stream
      if (cancelStream) {
        cancelStream();
      }

      streamCancel = await runStreamFunc(endpointIndex++, funcName, cancel, ...args);
    } else if (!!errCb) {
      errCb(err, streamCancel);
    }
  };

  streamCancel = await runStreamFunc(endpointIndex++, funcName, cancel, ...args);

  return () => {
    isCancelled = true;
    streamCancel();
  };
}

type ObjectMethodParameters<Key extends keyof Object, Object> = Object[Key] extends (
  ...args: infer P
) => any
  ? P
  : never;

/**
 * Repeats a factory method call across multiple API endpoints until a
 * successful response is received or all endpoints have been exhausted.
 *
 * This is especially useful for Kubernetes beta APIs that then stabalize.
 * @param apiEndpoints - An array of API endpoint objects returned by the `apiFactory` function.
 * @param funcName - The name of the factory method to call on each endpoint.
 *
 * @returns A function that cancels the factory method call.
 */
function repeatFactoryMethod<
  Client extends ApiClient<ResourceType> | ApiWithNamespaceClient<ResourceType>,
  ResourceType extends KubeObjectInterface,
  FuncName extends FunctionKeys<Client>
>(
  apiEndpoints: Array<Client>,
  funcName: FuncName
): (...args: ObjectMethodParameters<FuncName, Client>) => any {
  return async (...args) => {
    for (let i = 0; i < apiEndpoints.length; i++) {
      try {
        const endpoint = apiEndpoints[i];
        const func: any = endpoint[funcName as keyof typeof endpoint];
        return await func(...args);
      } catch (err) {
        // If the error is 404 and we still have other endpoints, then try the next one
        if ((err as ApiError).status === 404 && i !== apiEndpoints.length - 1) {
          continue;
        }

        throw err;
      }
    }
  };
}

// @todo: in apiFactory, and multipleApiFactory use rather than 'args'...
//        `group: string, version: string, resource: string`

/**
 * Creates an API client for a single or multiple Kubernetes resources.
 *
 * @param args - The arguments to pass to either `singleApiFactory` or `multipleApiFactory`.
 *
 * @returns An API client for the specified Kubernetes resource(s).
 */
export function apiFactory<ResourceType extends KubeObjectInterface = KubeObjectInterface>(
  ...args: ApiFactoryArguments
): ApiClient<ResourceType> {
  if (isDebugVerbose('k8s/apiProxy@apiFactory')) {
    console.debug('k8s/apiProxy@apiFactory', { args });
  }

  if (args[0] instanceof Array) {
    return multipleApiFactory(...(args as MultipleApiFactoryArguments));
  }

  return singleApiFactory(...(args as SingleApiFactoryArguments));
}

/**
 * Creates an API endpoint object for multiple API endpoints.
 * It first tries the first endpoint, then the second, and so on until it
 * gets a successful response.
 *
 * @param args - An array of arguments to pass to the `singleApiFactory` function.
 *
 * @returns An API endpoint object.
 */
export function multipleApiFactory<T extends KubeObjectInterface>(
  ...args: MultipleApiFactoryArguments
): ApiClient<T> {
  if (isDebugVerbose('k8s/apiProxy@multipleApiFactory')) {
    console.debug('k8s/apiProxy@multipleApiFactory', { args });
  }

  const apiEndpoints = args.map(apiArgs => singleApiFactory(...apiArgs));

  return {
    list: (cb, errCb, queryParams, cluster) => {
      return repeatStreamFunc(apiEndpoints, 'list', errCb, cb, queryParams, cluster);
    },
    get: (name, cb, errCb, queryParams, cluster) =>
      repeatStreamFunc(apiEndpoints, 'get', errCb, name, cb, queryParams, cluster),
    post: repeatFactoryMethod(apiEndpoints, 'post'),
    patch: repeatFactoryMethod(apiEndpoints, 'patch'),
    put: repeatFactoryMethod(apiEndpoints, 'put'),
    delete: repeatFactoryMethod(apiEndpoints, 'delete'),
    isNamespaced: false,
    apiInfo: args.map(apiArgs => ({
      group: apiArgs[0],
      version: apiArgs[1],
      resource: apiArgs[2],
    })),
  };
}

/**
 * Describes the API for a certain resource.
 */
export interface ApiInfo {
  /** The API group. */
  group: string;
  /** The API version. */
  version: string;
  /** The resource name. */
  resource: string;
}

// @todo: singleApiFactory should have a return type rather than just what it returns.

/**
 * @returns An object with methods for interacting with a single API endpoint.
 *
 * @param group - The API group.
 * @param version - The API version.
 * @param resource - The API resource.
 */
export function singleApiFactory<T extends KubeObjectInterface>(
  ...[group, version, resource]: SingleApiFactoryArguments
): ApiClient<T> {
  if (isDebugVerbose('k8s/apiProxy@singleApiFactory')) {
    console.debug('k8s/apiProxy@singleApiFactory', { group, version, resource });
  }

  const apiRoot = getApiRoot(group, version);
  const url = `${apiRoot}/${resource}`;
  return {
    list: (cb, errCb, queryParams, cluster) => {
      if (isDebugVerbose('k8s/apiProxy@singleApiFactory list')) {
        console.debug('k8s/apiProxy@singleApiFactory list', { cluster, queryParams });
      }

      return streamResultsForCluster(url, { cb, errCb, cluster }, queryParams);
    },
    get: (name, cb, errCb, queryParams, cluster) =>
      streamResult(url, name, cb, errCb, queryParams, cluster),
    post: (body, queryParams, cluster) => post(url + asQuery(queryParams), body, true, { cluster }),
    put: (body, queryParams, cluster) =>
      put(`${url}/${body.metadata.name}` + asQuery(queryParams), body, true, { cluster }),
    patch: (body, name, queryParams, cluster) =>
      patch(`${url}/${name}` + asQuery({ ...queryParams, ...{ pretty: 'true' } }), body, true, {
        cluster,
      }),
    delete: (name, deleteParams, cluster) =>
      remove(`${url}/${name}` + asQuery(deleteParams), { cluster }),
    isNamespaced: false,
    apiInfo: [{ group, version, resource }],
  };
}

// @todo: just use args from simpleApiFactoryWithNamespace, rather than `args`?
//        group: string, version: string, resource: string, includeScale: boolean = false

export function apiFactoryWithNamespace<T extends KubeObjectInterface>(
  ...args: ApiFactoryWithNamespaceArguments
) {
  if (args[0] instanceof Array) {
    return multipleApiFactoryWithNamespace<T>(
      ...(args as MultipleApiFactoryWithNamespaceArguments)
    );
  }

  return simpleApiFactoryWithNamespace<T>(...(args as SimpleApiFactoryWithNamespaceArguments));
}

function multipleApiFactoryWithNamespace<T extends KubeObjectInterface>(
  ...args: MultipleApiFactoryWithNamespaceArguments
): ApiWithNamespaceClient<T> {
  const apiEndpoints = args.map(apiArgs => simpleApiFactoryWithNamespace(...apiArgs));

  return {
    list: (namespace, cb, errCb, queryParams, cluster) => {
      return repeatStreamFunc(apiEndpoints, 'list', errCb, namespace, cb, queryParams, cluster);
    },
    get: (namespace, name, cb, errCb, queryParams, cluster) =>
      repeatStreamFunc(apiEndpoints, 'get', errCb, namespace, name, cb, queryParams, cluster),
    post: repeatFactoryMethod(apiEndpoints, 'post'),
    patch: repeatFactoryMethod(apiEndpoints, 'patch'),
    put: repeatFactoryMethod(apiEndpoints, 'put'),
    delete: repeatFactoryMethod(apiEndpoints, 'delete'),
    isNamespaced: true,
    apiInfo: args.map(apiArgs => ({
      group: apiArgs[0],
      version: apiArgs[1],
      resource: apiArgs[2],
    })),
  };
}

function simpleApiFactoryWithNamespace<T extends KubeObjectInterface>(
  ...[group, version, resource, includeScale = false]: SimpleApiFactoryWithNamespaceArguments
): ApiWithNamespaceClient<T> {
  if (isDebugVerbose('k8s/apiProxy@simpleApiFactoryWithNamespace')) {
    console.debug('k8s/apiProxy@simpleApiFactoryWithNamespace', {
      group,
      version,
      resource,
      includeScale,
    });
  }

  const apiRoot = getApiRoot(group, version);
  const results: ApiWithNamespaceClient<T> = {
    list: (namespace, cb, errCb, queryParams, cluster) => {
      if (isDebugVerbose('k8s/apiProxy@simpleApiFactoryWithNamespace list')) {
        console.debug('k8s/apiProxy@simpleApiFactoryWithNamespace list', { cluster, queryParams });
      }

      return streamResultsForCluster(url(namespace), { cb, errCb, cluster }, queryParams);
    },
    get: (namespace, name, cb, errCb, queryParams, cluster) =>
      streamResult(url(namespace), name, cb, errCb, queryParams, cluster),
    post: (body, queryParams, cluster) =>
      post(url(body.metadata?.namespace!) + asQuery(queryParams), body, true, { cluster }),
    patch: (body, namespace, name, queryParams, cluster) =>
      patch(
        `${url(namespace)}/${name}` + asQuery({ ...queryParams, ...{ pretty: 'true' } }),
        body,
        true,
        { cluster }
      ),
    put: (body, queryParams, cluster) =>
      put(
        `${url(body.metadata.namespace!)}/${body.metadata.name}` + asQuery(queryParams),
        body,
        true,
        { cluster }
      ),
    delete: (namespace, name, deleteParams, cluster) =>
      remove(`${url(namespace)}/${name}` + asQuery(deleteParams), { cluster }),
    isNamespaced: true,
    apiInfo: [{ group, version, resource }],
  };

  if (includeScale) {
    results.scale = apiScaleFactory(apiRoot, resource);
  }

  return results;

  function url(namespace: string) {
    return namespace ? `${apiRoot}/namespaces/${namespace}/${resource}` : `${apiRoot}/${resource}`;
  }
}

export async function resourceDefToApiFactory<ResourceType extends KubeObjectInterface>(
  resourceDef: KubeObjectInterface,
  clusterName?: string
): Promise<ApiClient<ResourceType> | ApiWithNamespaceClient<ResourceType>> {
  interface APIResourceList {
    resources: {
      kind: string;
      namespaced: boolean;
      singularName: string;
      name: string;
    }[];
    [other: string]: any;
  }
  if (isDebugVerbose('k8s/apiProxy@resourceDefToApiFactory')) {
    console.debug('k8s/apiProxy@resourceDefToApiFactory', { resourceDef });
  }

  if (!resourceDef.kind) {
    throw new Error(`Cannot handle unknown resource kind: ${resourceDef.kind}`);
  }

  if (!resourceDef.apiVersion) {
    throw new Error(`Definition ${resourceDef.kind} has no apiVersion`);
  }

  let [apiGroup, apiVersion] = resourceDef.apiVersion.split('/');

  // There may not be an API group [1], which means that the apiGroup variable will
  // actually hold the apiVersion, so we switch them.
  // [1] https://kubernetes.io/docs/reference/using-api/#api-groups
  if (!!apiGroup && !apiVersion) {
    apiVersion = apiGroup;
    apiGroup = '';
  }

  if (!apiVersion) {
    throw new Error(`apiVersion has no version string: ${resourceDef.apiVersion}`);
  }

  const cluster = clusterName || getCluster() || '';

  // Get details about this resource. We could avoid this for known resources, but
  // this way we always get the right plural name and we also avoid eventually getting
  // the wrong "known" resource because e.g. there can be CustomResources with the same
  // kind as a known resource.
  const apiPrefix = !!apiGroup ? 'apis' : 'api';
  const apiResult: APIResourceList = await clusterRequest(
    `/${apiPrefix}/${resourceDef.apiVersion}`,
    {
      cluster,
      autoLogoutOnAuthError: false,
    }
  );
  if (!apiResult) {
    throw new Error(`Unkown apiVersion: ${resourceDef.apiVersion}`);
  }

  // Get resource
  const resource = apiResult.resources?.find(({ kind }) => kind === resourceDef.kind);

  if (!resource) {
    throw new Error(`Unkown resource kind: ${resourceDef.kind}`);
  }

  const hasNamespace = !!resource.namespaced;

  const factoryFunc = hasNamespace ? apiFactoryWithNamespace : apiFactory;

  return factoryFunc(apiGroup, apiVersion, resource.name);
}

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

/*
 * This module was originally taken from the K8dash project before modifications.
 *
 * K8dash is licensed under Apache License 2.0.
 *
 * Copyright © 2020 Eric Herbrandson
 * Copyright © 2020 Kinvolk GmbH
 */

/**
 * @todo: A summary of things marked for fixing in this file marked with todo:
 *
 * - Return types are missing in places.
 * - Some types are "any".
 * - No docs on some functions and interfaces.
 * - Async is missing on some functions that need to be marked as so.
 * - Some of the users of the functions are not handling errors.
 */

// Uncomment the following lines to enable verbose debug logging in this module.
// import { debugVerbose } from '../../helpers/debugVerbose';
// debugVerbose('k8s/apiProxy');

export type { QueryParameters } from '../api/v1/queryParameters';
export type { DeleteParameters } from '../api/v1/deleteParameters';

// Basic cluster API functions
export {
  clusterRequest,
  patch,
  post,
  put,
  remove,
  request,
  type ClusterRequest,
  type ClusterRequestParams,
  type RequestParams,
} from '../api/v1/clusterRequests';

// Streaming API functions
export {
  stream,
  streamResult,
  streamResults,
  streamResultsForCluster,
  type StreamArgs,
  type StreamResultsParams,
  type StreamResultsCb,
  type StreamErrCb,
} from '../api/v1/streamingApi';

// API factory functions
export {
  apiFactory,
  apiFactoryWithNamespace,
  type ApiInfo,
  type ApiClient,
  type ApiWithNamespaceClient,
} from '../api/v1/factories';

// Port forward functions
export { listPortForward, startPortForward, stopOrDeletePortForward } from '../api/v1/portForward';

export {
  deleteCluster,
  setCluster,
  testAuth,
  testClusterHealth,
  parseKubeConfig,
  renameCluster,
  getClusterUserInfo,
} from '../api/v1/clusterApi';
export { metrics } from '../api/v1/metricsApi';
export { deletePlugin } from '../api/v1/pluginsApi';

export { drainNodeStatus, drainNode } from '../api/v1/drainNode';

export { apply } from '../api/v1/apply';

export { ApiError } from '../api/v2/ApiError';

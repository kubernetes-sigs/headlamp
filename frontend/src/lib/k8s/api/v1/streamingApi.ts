import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { findKubeconfigByClusterName, getUserIdFromLocalStorage } from '../../../../stateless';
import { getToken } from '../../../auth';
import { getCluster } from '../../../cluster';
import { KubeObjectInterface } from '../../KubeObject';
import { ApiError } from '../v2/ApiError';
import { clusterRequest } from './clusterRequests';
import { BASE_HTTP_URL, CLUSTERS_PREFIX } from './constants';
import { asQuery, combinePath } from './formatUrl';
import { QueryParameters } from './queryParameters';

export type StreamUpdate<T = any> = {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';
  object: T;
};

export type StreamResultsCb<T = any> = (data: T) => void;
export type StreamUpdatesCb<T = any> = (data: T | StreamUpdate<T>) => void;
export type StreamErrCb = (err: Error & { status?: number }, cancelStreamFunc?: () => void) => void;

const BASE_WS_URL = BASE_HTTP_URL.replace('http', 'ws');

/**
 * Fetches the data and watches for changes to the data.
 *
 * @param url - The URL of the Kubernetes API endpoint.
 * @param name - The name of the Kubernetes API resource.
 * @param cb - The callback function to execute when the stream receives data.
 * @param errCb - The callback function to execute when an error occurs.
 * @param queryParams - The query parameters to include in the API request.
 *
 * @returns A function to cancel the stream.
 */
export function streamResult<T extends KubeObjectInterface>(
  url: string,
  name: string,
  cb: StreamResultsCb<T>,
  errCb: StreamErrCb,
  queryParams?: QueryParameters,
  cluster?: string
) {
  let isCancelled = false;
  let socket: ReturnType<typeof stream>;
  const clusterName = cluster || getCluster() || '';

  if (isDebugVerbose('k8s/apiProxy@streamResult')) {
    console.debug('k8s/apiProxy@streamResult', { url, name, queryParams });
  }

  run();

  return Promise.resolve(cancel);

  async function run() {
    try {
      const item = await clusterRequest(`${url}/${name}` + asQuery(queryParams), {
        cluster: clusterName,
      });

      if (isCancelled) return;

      if (isDebugVerbose('k8s/apiProxy@streamResult run cb(item)')) {
        console.debug('k8s/apiProxy@streamResult run cb(item)', { item });
      }

      cb(item);

      const watchUrl =
        url +
        asQuery({ ...queryParams, ...{ watch: '1', fieldSelector: `metadata.name=${name}` } });

      socket = stream(watchUrl, (x: any) => cb(x.object), { isJson: true, cluster: clusterName });
    } catch (err) {
      console.error('Error in api request', { err, url });
      // @todo: sometimes errCb is {}, the typing for apiProxy needs improving.
      //        See https://github.com/kinvolk/headlamp/pull/833
      if (errCb && typeof errCb === 'function') errCb(err as ApiError, cancel);
    }
  }

  function cancel() {
    if (isCancelled) return;
    isCancelled = true;

    if (socket) socket.cancel();
  }
}

/**
 * Streams the results of a Kubernetes API request.
 *
 * @param url - The URL of the Kubernetes API endpoint.
 * @param cb - The callback function to execute when the stream receives data.
 * @param errCb - The callback function to execute when an error occurs.
 * @param queryParams - The query parameters to include in the API request.
 *
 * @returns A function to cancel the stream.
 */
export function streamResults<T extends KubeObjectInterface>(
  url: string,
  cb: StreamResultsCb<T>,
  errCb: StreamErrCb,
  queryParams: QueryParameters | undefined
) {
  const cluster = getCluster() || '';
  return streamResultsForCluster(url, { cb, errCb, cluster }, queryParams);
}

// @todo: this interface needs documenting.

export interface StreamResultsParams {
  cb: StreamResultsCb;
  errCb: StreamErrCb;
  cluster?: string;
}

// @todo: needs documenting

export function streamResultsForCluster(
  url: string,
  params: StreamResultsParams,
  queryParams?: QueryParameters
): Promise<() => void> {
  const { cb, errCb, cluster = '' } = params;
  const clusterName = cluster || getCluster() || '';

  const results: Record<string, any> = {};
  let isCancelled = false;
  let socket: ReturnType<typeof stream>;

  if (isDebugVerbose('k8s/apiProxy@streamResults')) {
    console.debug('k8s/apiProxy@streamResults', { url, queryParams });
  }

  // -1 means unlimited.
  const maxResources =
    typeof queryParams?.limit === 'number'
      ? queryParams.limit
      : parseInt(queryParams?.limit ?? '-1');

  run();

  return Promise.resolve(cancel);

  async function run() {
    try {
      const { kind, items, metadata } = await clusterRequest(url + asQuery(queryParams), {
        cluster: clusterName,
      });

      if (isCancelled) return;

      add(items, kind);

      const watchUrl =
        url +
        asQuery({ ...queryParams, ...{ watch: '1', resourceVersion: metadata.resourceVersion } });
      socket = stream(watchUrl, update, { isJson: true, cluster: clusterName });
    } catch (err) {
      console.error('Error in api request', { err, url });
      if (errCb && typeof errCb === 'function') {
        errCb(err as ApiError, cancel);
      }
    }
  }

  function cancel() {
    if (isCancelled) return;
    isCancelled = true;

    if (socket) socket.cancel();
  }

  function add(items: any[], kind: string) {
    const fixedKind = kind.slice(0, -4); // Trim off the word "List" from the end of the string
    for (const item of items) {
      item.kind = fixedKind;
      results[item.metadata.uid] = item;
    }

    push();
  }

  function update({ type, object }: StreamUpdate) {
    (object as KubeObjectInterface).actionType = type; // eslint-disable-line no-param-reassign

    switch (type) {
      case 'ADDED':
        results[object.metadata.uid] = object;
        break;
      case 'MODIFIED': {
        const existing = results[object.metadata.uid];

        if (existing) {
          if (!existing.metadata.resourceVersion || !object.metadata.resourceVersion) {
            console.error('Missing resourceVersion in object', object);
            break;
          }
          const currentVersion = parseInt(existing.metadata.resourceVersion, 10);
          const newVersion = parseInt(object.metadata.resourceVersion, 10);
          if (currentVersion < newVersion) {
            Object.assign(existing, object);
          }
        } else {
          results[object.metadata.uid] = object;
        }

        break;
      }
      case 'DELETED':
        delete results[object.metadata.uid];
        break;
      case 'ERROR':
        console.error('Error in update', { type, object });
        break;
      default:
        console.error('Unknown update type', type);
    }

    push();
  }

  function push() {
    const values = Object.values(results);
    // Limit the number of resources to maxResources. We do this because when we're streaming, the
    // API server will send us all the resources that match the query, without limitting, even if the
    // API params wanted to limit it. So we do the limitting here.
    if (maxResources > 0 && values.length > maxResources) {
      values.sort((a, b) => {
        const aTime = new Date(a.lastTimestamp || a.metadata.creationTimestamp!).getTime();
        const bTime = new Date(b.lastTimestamp || b.metadata.creationTimestamp!).getTime();
        // Reverse sort, so we have the most recent resources at the beginning of the array.
        return 0 - (aTime - bTime);
      });
      values.splice(0, values.length - maxResources);
    }

    if (isDebugVerbose('k8s/apiProxy@push cb(values)')) {
      console.debug('k8s/apiProxy@push cb(values)', { values });
    }
    cb(values);
  }
}

/**
 * Configure a stream with... StreamArgs.
 */
export interface StreamArgs {
  /** Whether the stream is expected to receive JSON data. */
  isJson?: boolean;
  /** Additional WebSocket protocols to use when connecting. */
  additionalProtocols?: string[];
  /** A callback function to execute when the WebSocket connection is established. */
  connectCb?: () => void;
  /** Whether to attempt to reconnect the WebSocket connection if it fails. */
  reconnectOnFailure?: boolean;
  /** A callback function to execute when the WebSocket connection fails. */
  failCb?: () => void;
  tty?: boolean;
  stdin?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  cluster?: string;
}

/**
 * Establishes a WebSocket connection to the specified URL and streams the results
 * to the provided callback function.
 *
 * @param url - The URL to connect to.
 * @param cb - The callback function to receive the streamed results.
 * @param args - Additional arguments to configure the stream.
 *
 * @returns An object with two functions: `cancel`, which can be called to cancel
 * the stream, and `getSocket`, which returns the WebSocket object.
 */
export function stream<T>(url: string, cb: StreamResultsCb<T>, args: StreamArgs) {
  let connection: { close: () => void; socket: WebSocket | null } | null = null;
  let isCancelled = false;
  const { failCb, cluster = '' } = args;
  // We only set reconnectOnFailure as true by default if the failCb has not been provided.
  const { isJson = false, additionalProtocols, connectCb, reconnectOnFailure = !failCb } = args;

  if (isDebugVerbose('k8s/apiProxy@stream')) {
    console.debug('k8s/apiProxy@stream', { url, args });
  }

  connect();

  return { cancel, getSocket };

  function getSocket() {
    return connection ? connection.socket : null;
  }

  function cancel() {
    if (connection) connection.close();
    isCancelled = true;
  }

  async function connect() {
    if (connectCb) connectCb();
    try {
      connection = await connectStream(url, cb, onFail, isJson, additionalProtocols, cluster);
    } catch (error) {
      console.error('Error connecting stream:', error);
      onFail();
    }
  }

  function retryOnFail() {
    if (isCancelled) return;

    if (reconnectOnFailure) {
      if (isDebugVerbose('k8s/apiProxy@stream retryOnFail')) {
        console.debug('k8s/apiProxy@stream retryOnFail', 'Reconnecting in 3 seconds', { url });
      }

      setTimeout(connect, 3000);
    }
  }

  function onFail() {
    if (!!failCb) {
      failCb();
    }

    if (reconnectOnFailure) {
      retryOnFail();
    }
  }
}

// @todo: needs a return type.

/**
 * Connects to a WebSocket stream at the specified path and returns an object
 * with a `close` function and a `socket` property. Sends messages to `cb` callback.
 *
 * @param path - The path of the WebSocket stream to connect to.
 * @param cb - The function to call with each message received from the stream.
 * @param onFail - The function to call if the stream is closed unexpectedly.
 * @param isJson - Whether the messages should be parsed as JSON.
 * @param additionalProtocols - An optional array of additional WebSocket protocols to use.
 *
 * @returns An object with a `close` function and a `socket` property.
 */
export async function connectStream<T>(
  path: string,
  cb: StreamResultsCb<T>,
  onFail: () => void,
  isJson: boolean,
  additionalProtocols: string[] = [],
  cluster = ''
) {
  return connectStreamWithParams(path, cb, onFail, {
    isJson,
    cluster: cluster || getCluster() || '',
    additionalProtocols,
  });
}

// @todo: needs documenting.

interface StreamParams {
  cluster?: string;
  isJson?: boolean;
  additionalProtocols?: string[];
}

/**
 * connectStreamWithParams is a wrapper around connectStream that allows for more
 * flexibility in the parameters that can be passed to the WebSocket connection.
 *
 * This is an async function because it may need to fetch the kubeconfig for the
 * cluster if the cluster is specified in the params. If kubeconfig is found, it
 * sends the X-HEADLAMP-USER-ID header with the user ID from the localStorage.
 * It is sent as a base64url encoded string in protocal format:
 * `base64url.headlamp.authorization.k8s.io.${userID}`.
 *
 * @param path - The path of the WebSocket stream to connect to.
 * @param cb - The function to call with each message received from the stream.
 * @param onFail - The function to call if the stream is closed unexpectedly.
 * @param params - Stream parameters to configure the connection.
 *
 * @returns A promise that resolves to an object with a `close` function and a `socket` property.
 */
export async function connectStreamWithParams<T>(
  path: string,
  cb: StreamResultsCb<T>,
  onFail: () => void,
  params?: StreamParams
): Promise<{
  close: () => void;
  socket: WebSocket | null;
}> {
  const { isJson = false, additionalProtocols = [], cluster = '' } = params || {};
  let isClosing = false;

  const token = getToken(cluster || '');
  const userID = getUserIdFromLocalStorage();

  const protocols = ['base64.binary.k8s.io', ...additionalProtocols];
  if (token) {
    const encodedToken = btoa(token).replace(/=/g, '');
    protocols.push(`base64url.bearer.authorization.k8s.io.${encodedToken}`);
  }

  let fullPath = path;
  let url = '';
  if (cluster) {
    fullPath = combinePath(`/${CLUSTERS_PREFIX}/${cluster}`, path);
    try {
      const kubeconfig = await findKubeconfigByClusterName(cluster);

      if (kubeconfig !== null) {
        protocols.push(`base64url.headlamp.authorization.k8s.io.${userID}`);
      }

      url = combinePath(BASE_WS_URL, fullPath);
    } catch (error) {
      console.error('Error while finding kubeconfig:', error);
      // If we can't find the kubeconfig, we'll just use the base URL.
      url = combinePath(BASE_WS_URL, fullPath);
    }
  }

  let socket: WebSocket | null = null;
  try {
    socket = new WebSocket(url, protocols);
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    socket.addEventListener('error', onError);
  } catch (error) {
    console.error(error);
  }

  return { close, socket };

  function close() {
    isClosing = true;
    if (!socket) {
      return;
    }

    socket.close();
  }

  function onMessage(body: MessageEvent) {
    if (isClosing) return;

    const item = isJson ? JSON.parse(body.data) : body.data;
    if (isDebugVerbose('k8s/apiProxy@connectStream onMessage cb(item)')) {
      console.debug('k8s/apiProxy@connectStream onMessage cb(item)', { item });
    }

    cb(item);
  }

  function onClose(...args: any[]) {
    if (isClosing) return;
    isClosing = true;
    if (!socket) {
      return;
    }

    if (socket) {
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
      socket.removeEventListener('error', onError);
    }

    console.warn('Socket closed unexpectedly', { path, args });
    onFail();
  }

  function onError(err: any) {
    console.error('Error in api stream', { err, path });
  }
}

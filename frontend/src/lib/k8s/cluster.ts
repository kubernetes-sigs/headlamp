import { loadClusterSettings } from '../../helpers/clusterSettings';
import { getCluster } from '../cluster';
import { KubeMetadata } from './KubeMetadata';
export {
  KubeObject,
  makeKubeObject,
  type KubeObjectClass,
  type KubeObjectInterface,
  type ApiListOptions,
  type ApiListSingleNamespaceOptions,
  type AuthRequestResourceAttrs,
} from './KubeObject';
export { type KubeMetadata } from './KubeMetadata';
export { type Workload } from './Workload';

export const HEADLAMP_ALLOWED_NAMESPACES = 'headlamp.allowed-namespaces';

/**
 * Gives an optionally configured list of allowed namespaces.
 *
 * @param cluster Optional cluster to check for allowed namespaces.
 *                If not given the current cluster allowed name spaces are used.
 *
 * @returns A list of configured name spaces for the given cluster or current cluster.
 *          If a zero length list, then no allowed namespace has been configured for cluster.
 *          If length > 0, allowed namespaces have been configured for this cluster.
 *          If not in a cluster it returns [].
 *
 * There are cases where a user doesn't have the authority to list
 * all the namespaces. In that case it becomes difficult to access things
 * around Headlamp. To prevent this we can allow the user to pass a set
 * of namespaces they know they have access to and we can use this set to
 * make requests to the API server.
 */
export function getAllowedNamespaces(cluster: string | null = getCluster()): string[] {
  if (!cluster) {
    return [];
  }

  const clusterSettings = loadClusterSettings(cluster);
  return clusterSettings.allowedNamespaces || [];
}

export interface Cluster {
  name: string;
  useToken?: boolean;
  /**
   * Either 'oidc' or ''. '' means unknown.
   */
  auth_type: string;
  [propName: string]: any;
}

export interface StringDict {
  [key: string]: string;
}

export interface KubeOwnerReference {
  /** API version of the referent. */
  apiVersion: string;
  /**
   * If true, AND if the owner has the "foregroundDeletion" finalizer, then the owner cannot
   * be deleted from the key-value store until this reference is removed.
   *
   * @see {@link https://kubernetes.io/docs/concepts/architecture/garbage-collection/#foreground-deletion | foreground deletion}
   * for how the garbage collector interacts with this field and enforces the foreground deletion.
   *
   * Defaults to false. To set this field, a user needs "delete" permission of the owner,
   * otherwise 422 (Unprocessable Entity) will be returned.
   *
   */
  blockOwnerDeletion: boolean;
  /** If true, this reference points to the managing controller. */
  controller: boolean;
  /** Kind of the referent. */
  kind: string;
  /** Name of the referent. */
  name: string;
  /** UID of the referent. */
  uid: string;
}

/**
 * ManagedFieldsEntry is a workflow-id, a FieldSet and the group version of the
 * resource that the fieldset applies to.
 */
export interface KubeManagedFieldsEntry {
  /**
   * APIVersion defines the version of this resource that this field set applies to.
   * The format is "group/version" just like the top-level APIVersion field.
   * It is necessary to track the version of a field set because it cannot be
   * automatically converted.
   */
  apiVersion: string;
  /**
   * FieldsType is the discriminator for the different fields format and version.
   * There is currently only one possible value: "FieldsV1"
   */
  fieldsType: string;
  /**
   * FieldsV1 holds the first JSON version format as described in the "FieldsV1" type.
   */
  fieldsV1: object;
  /**
   * Manager is an identifier of the workflow managing these fields.
   */
  manager: string;
  /**
   * Operation is the type of operation which lead to this ManagedFieldsEntry being
   * created. The only valid values for this field are 'Apply' and 'Update'.
   */
  operation: string;
  /**
   * Subresource is the name of the subresource used to update that object, or empty
   * string if the object was updated through the main resource. The value of this
   * field is used to distinguish between managers, even if they share the same name.
   * For example, a status update will be distinct from a regular update using the
   * same manager name. Note that the APIVersion field is not related to the
   * Subresource field and it always corresponds to the version of the main resource.
   */
  subresource: string;
  /**
   * Time is the timestamp of when the ManagedFields entry was added.The timestamp
   * will also be updated if a field is added, the manager changes any of the owned
   * fields value or removes a field. The timestamp does not update when a field is
   * removed from the entry because another manager took it over.
   */
  timestamp: string;
}

/**
 * @deprecated For backwards compatibility, please use KubeManagedFieldsEntry
 */
export interface KubeManagedFields extends KubeManagedFieldsEntry {}

/**
 * @deprecated For backwards compatibility, please use KubeObject
 */
export type KubeObjectIface = any;

export type Time = number | string | null;

// @todo: There are different Condition types, including PodCondition, NodeCondition, etc.
// We should have appropriate types for each of them, because they can be slightly different.
// eg. DaemonSetCondition does not have lastProbeTime.
// https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#podcondition-v1-core
// https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#nodecondition-v1-core

export interface KubeCondition {
  /** Last time we probed the condition. */
  lastProbeTime: Time;
  lastTransitionTime?: Time;
  lastUpdateTime?: Time;
  message?: string;
  /** Unique, one-word, CamelCase reason for the condition's last transition. */
  reason?: string;
  /** Status of the condition, one of True, False, Unknown. */
  status: string;
  type: string;
}

/**
 *
 * @link https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#container-v1-core
 */
export interface KubeContainer {
  /**
   * Arguments to the entrypoint. The container image's CMD is used if this is not provided.
   * Variable references $(VAR_NAME) are expanded using the container's environment.
   * If a variable cannot be resolved, the reference in the input string will be unchanged.
   * Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME)
   * syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
   * Escaped references will never be expanded, regardless of whether the variable exists or not.
   * Cannot be updated.
   *
   * @see {@link https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell | more information}
   */
  args?: string[];
  /**
   * Entrypoint array. Not executed within a shell. The container image's ENTRYPOINT is used if
   * this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment.
   * If a variable cannot be resolved, the reference in the input string will be unchanged.
   * Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME)
   * syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
   * Escaped references will never be expanded, regardless of whether the variable exists or not.
   * Cannot be updated.
   *
   * @see {@link https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell | more information}
   */
  command?: string[];

  /** List of environment variables to set in the container. Cannot be updated. */
  env?: {
    /** Name of the environment variable. Must be a C_IDENTIFIER. */
    name: string;
    /**
     * Variable references $(VAR_NAME) are expanded using the previously defined environment variables
     * in the container and any service environment variables. If a variable cannot be resolved, the
     * reference in the input string will be unchanged. Double $$ are reduced to a single $, which
     * allows for escaping the $(VAR_NAME) syntax: i.e. "$$(VAR_NAME)" will produce the
     * string literal "$(VAR_NAME)". Escaped references will never be expanded, regardless of whether
     * the variable exists or not. Defaults to "".
     */
    value?: string;
    /** Source for the environment variable's value. Cannot be used if value is not empty. */
    valueFrom?: {
      /** Selects a key of a ConfigMap. */
      configMapKeyRef?: {
        /** The key to select. */
        key: string;
        /** Name of the referent. */
        name: string;
        /** Specify whether the ConfigMap or its key must be defined */
        optional?: boolean;
      };
      /**
       * Selects a field of the pod: supports metadata.name, metadata.namespace, `metadata.labels['<KEY>']`,
       * `metadata.annotations['<KEY>']`, spec.nodeName, spec.serviceAccountName, status.hostIP,
       * status.podIP, status.podIPs.
       */
      fieldRef?: {
        /** Version of the schema the FieldPath is written in terms of, defaults to "v1". */
        apiVersion: string;
        /** Path of the field to select in the specified API version. */
        fieldPath: string;
      };
      /**
       * Selects a resource of the container: only resources limits and requests
       * (limits.cpu, limits.memory, limits.ephemeral-storage, requests.cpu, requests.memory
       *  and requests.ephemeral-storage) are currently supported.
       */
      resourceFieldRef?: {
        /** Container name: required for volumes, optional for env vars */
        containerName?: string;
        /**
         * Specifies the output format of the exposed resources, defaults to "1".
         *
         * @see {@link https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#quantity-resource-core | Quantity}
         */
        divisor?: string;
        /** Required: resource to select */
        resource: string;
      };
      /** Selects a key of a secret in the pod's namespace */
      secretKeyRef?: {
        /** The key of the secret to select from. Must be a valid secret key. */
        key: string;
        /** Name of the referent. */
        name: string;
        /** Specify whether the Secret or its key must be defined */
        optional?: boolean;
      };
    };
  }[];
  envFrom?: {
    /** SecretEnvSource	The Secret to select from */
    secretRef?: {
      /** Name of the referent. */
      name: string;
      /** Specify whether the Secret must be defined */
      optional?: boolean;
    };
    configMapRef?: {
      /** Name of the referent. */
      name: string;
      /** Specify whether the ConfigMap must be defined */
      optional?: boolean;
    };
    /** An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER. */
    prefix?: string;
  }[];

  /**
   * Container image name. This field is optional to allow higher level config management to
   * default or override container images in workload controllers like Deployments and StatefulSets.
   *
   * @see {@link https://kubernetes.io/docs/concepts/containers/images | more info}
   */
  image: string;

  /**
   * Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is
   * specified, or IfNotPresent otherwise. Cannot be updated.
   *
   * @see {@link https://kubernetes.io/docs/concepts/containers/images#updating-images | more info}
   */
  imagePullPolicy: string;

  // @todo: Add lifecycle field.

  /**
   * Periodic probe of container liveness. Container will be restarted if the probe fails.
   * Cannot be updated.
   *
   * @see {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes | more info}
   */
  livenessProbe?: KubeContainerProbe;

  /**
   * Name of the container specified as a DNS_LABEL.
   * Each container in a pod must have a unique name (DNS_LABEL).
   *
   * Cannot be updated.
   */
  name: string;

  /**
   * List of ports to expose from the container. Not specifying a port here DOES NOT prevent that
   * port from being exposed. Any port which is listening on the default "0.0.0.0" address inside
   * a container will be accessible from the network. Modifying this array with strategic merge
   * patch may corrupt the data. For more information See https://github.com/kubernetes/kubernetes/issues/108255.
   *
   * Cannot be updated.
   *
   * https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#containerport-v1-core
   */
  ports?: {
    /** Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536. */
    containerPort: number;
    /** What host IP to bind the external port to. */
    hostIP?: string;
    /**
     * Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536.
     * If HostNetwork is specified, this must match ContainerPort. Most containers do not need this.
     */
    hostPort?: number;
    /** If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must have a unique name. Name for the port that can be referred to by services. */
    name?: string;
    /** Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP". */
    protocol?: string;
  }[];
  /**
   * Periodic probe of container service readiness. Container will be removed from service endpoints
   * if the probe fails.
   *
   * Cannot be updated.
   *
   * @see {@link https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes | more info}
   */
  readinessProbe?: KubeContainerProbe;
  /** Resources resize policy for the container. */
  resizePolicy?: {
    /**
     * Name of the resource to which this resource resize policy applies.
     * Supported values: cpu, memory.
     */
    resourceName: string;
    /**
     * Restart policy to apply when specified resource is resized.
     * If not specified, it defaults to NotRequired.
     */
    restartPolicy?: string;
  }[];
  /**
   * Compute Resources required by this container. Cannot be updated.
   *
   * @see {@link https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ | more info}
   *
   * https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#resourcerequirements-v1-core
   */
  resources?: {
    claims?: {
      /**
       * Name must match the name of one entry in pod.spec.resourceClaims of the Pod where
       * this field is used. It makes that resource available inside a container.
       */
      name: string;
    };
    /**
     * Limits describes the maximum amount of compute resources allowed.
     *
     * @see {@link https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ | more info}
     *
     * Can also have hugpages like: "hugepages-2Mi": "100Mi" // Requesting 100 Mebibytes of 2 MiB HugePages
     */
    limits?: {
      /** example "100m", 100 milliCPU (0.1 CPU core) */
      cpu?: string;
      /** example , "256Mi" 256 Mebibytes */
      memory?: string;
    };
    requests?: {
      /** example "500m", 500 milliCPU (0.5 CPU core) */
      cpu?: string;
      /** example , "1Gi" 1 Gibibyte */
      memory?: string;
    };
  };

  // @todo:
  // securityContext SecurityContext	SecurityContext defines the security options the container should be run with. If set, the fields of SecurityContext override the equivalent fields of PodSecurityContext. More info: https://kubernetes.io/docs/tasks/configure-pod-container/security-context/
  // startupProbe Probe	StartupProbe indicates that the Pod has successfully initialized. If specified, no other probes are executed until this completes successfully. If this probe fails, the Pod will be restarted, just as if the livenessProbe failed. This can be used to provide different probe parameters at the beginning of a Pod's lifecycle, when it might take a long time to load data or warm a cache, than during steady-state operation. This cannot be updated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

  /**
   * Path at which the file to which the container's termination message will be written is mounted
   * into the container's filesystem. Message written is intended to be brief final status, such as
   * an assertion failure message. Will be truncated by the node if greater than 4096 bytes.
   * The total message length across all containers will be limited to 12kb.
   * Defaults to /dev/termination-log.
   *
   * Cannot be updated.
   */
  terminationMessagePath?: string;

  /**
   * Indicate how the termination message should be populated. File will use the contents of
   * terminationMessagePath to populate the container status message on both success and failure.
   * FallbackToLogsOnError will use the last chunk of container log output if the termination message
   * file is empty and the container exited with an error. The log output is limited to 2048 bytes or
   * 80 lines, whichever is smaller. Defaults to File.
   *
   * Cannot be updated.
   */
  terminationMessagePolicy?: string;

  volumeMounts?: {
    name: string;
    readOnly: boolean;
    mountPath: string;
  }[];

  /**
   * Whether this container should allocate a buffer for stdin in the container runtime.
   * If this is not set, reads from stdin in the container will always result in EOF.
   *
   * Default is false.
   */
  stdin?: boolean;
  /**
   * Whether the container runtime should close the stdin channel after it has been opened
   * by a single attach. When stdin is true the stdin stream will remain open across
   * multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start,
   * is empty until the first client attaches to stdin, and then remains open and accepts data
   * until the client disconnects, at which time stdin is closed and remains closed until the
   * container is restarted. If this flag is false, a container processes that reads from stdin
   * will never receive an EOF.
   *
   * Default is false
   */
  stdinOnce?: boolean;
  /**
   * Whether this container should allocate a TTY for itself, also requires
   * 'stdin' to be true.
   *
   * Default is false.
   */
  tty?: boolean;
  /**
   * volumeDevices is the list of block devices to be used by the container.
   *
   * patch strategy: merge
   * patch merge key: devicePath
   */
  volumeDevices?: {
    /** devicePath is the path inside of the container that the device will be mapped to. */
    devicePath: string;
    /** name must match the name of a persistentVolumeClaim in the pod */
    name: string;
  }[];
  /**
   * Container's working directory. If not specified, the container runtime's default
   * will be used, which might be configured in the container image.
   * Cannot be updated.
   */
  workingDir?: string;
}

export interface KubeContainerProbe {
  httpGet?: {
    path?: string;
    port: number;
    scheme: string;
    host?: string;
  };
  exec?: {
    command: string[];
  };
  tcpSocket?: {
    port: number;
  };
  initialDelaySeconds?: number;
  timeoutSeconds?: number;
  periodSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
}

export interface LabelSelector {
  matchExpressions?: {
    key: string;
    operator: string;
    values: string[];
  }[];
  matchLabels?: {
    [key: string]: string;
  };
}

export interface KubeMetrics {
  metadata: KubeMetadata;
  usage: {
    cpu: string;
    memory: string;
  };
  status: {
    capacity: {
      cpu: string;
      memory: string;
    };
  };
}

export interface ContainerState {
  running: {
    startedAt: string;
  };
  terminated: {
    containerID: string;
    exitCode: number;
    finishedAt: string;
    message?: string;
    reason: string;
    signal?: number;
    startedAt: string;
  };
  waiting: {
    message?: string;
    reason: string;
  };
}

export interface KubeContainerStatus {
  containerID?: string;
  image: string;
  imageID: string;
  name: string;
  ready: boolean;
  restartCount: number;
  lastState: Partial<ContainerState>;
  state: Partial<ContainerState>;
  started?: boolean;
}

export interface KubeObject {
  kind: string;
  apiVersion?: string;
  metadata: KubeMetadata;
  [otherProps: string]: any;
}

export interface StringDict {
  [key: string]: string;
}

export interface KubeMetadata {
  uid: string;
  name: string;
  namespace?: string;
  creationTimestamp: string;
  resourceVersion: string;
  selfLink: string;
  labels?: StringDict;
  annotations?: StringDict;
}

export interface KubeCondition {
  type: string;
  status: string;
  lastProbeTime: number;
  lastTransitionTime?: string;
  lastUpdateTime?: string;
  reason?: string;
  message?: string;
}

export interface KubeContainer {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  ports: {
    name?: string;
    containerPort: number;
    protocol: string;
  }[];
  resources?: {
    limits: {
      cpu: string;
      memory: string;
    };
    requests: {
      cpu: string;
      memory: string;
    };
  };
  env?: {
    name: string;
    value?: string;
    valueFrom?: {
      fieldRef?: {
        apiVersion: string;
        fieldPath: string;
      };
      secretKeyRef?: {
        key: string;
        name: string;
      };
      configMapKeyRef?: {
        key: string;
        name: string;
      };
    };
  }[];
  envFrom?: {
    configMapRef?: {
      name: string;
    };
  }[];
  volumeMounts?: {
    name: string;
    readOnly: boolean;
    mountPath: string;
  }[];
  livenessProbe?: KubeContainerProbe;
  readinessProbe?: KubeContainerProbe;
  imagePullPolicy: string;
}

interface KubeContainerProbe {
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

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  metadata: KubeMetadata;
  involvedObject: {
    kind: string;
    namespace: string;
    name: string;
    uid: string;
    apiVersion: string;
    resourceVersion: string;
    fieldPath: string;
  };
  [otherProps: string]: any;
}

export interface KubeConfigMap extends KubeObject {
  data: StringDict;
}

export interface KubeIngress extends KubeObject {
  spec: {
    rules: {
      host: string;
      http: {
        paths: {
          path: string;
          backend: {
            serviceName: string;
            servicePort: string;
          };
        }[];
      };
    }[];
  };
}

interface LabelSelector {
  matchExpressions?: {
    key: string;
    operator: string;
    values: string[];
  };
  matchLabels?: {
    [key: string]: string;
  };
}

export interface KubeDaemonSet extends KubeObject {
  spec: {
    updateStrategy: {
      type: string;
      rollingUpdate: {
        maxUnavailable: number;
      };
    };
    selector: LabelSelector;
    [otherProps: string]: any;
  };
}

export interface KubeNamespace extends KubeObject {
  status: {
    phase: string;
  };
}

export interface KubeNode extends KubeObject {
  status: {
    addresses: {
      address: string;
      type: string;
    }[];
    capacity: {
      cpu: any;
      memory: any;
    };
    conditions: (Omit<KubeCondition, 'lastProbeTime' | 'lastUpdateTime'> & {
      lastHeartbeatTime: string;
    })[];
    nodeInfo: {
      architecture: string;
      bootID: string;
      containerRuntimeVersion: string;
      kernelVersion: string;
      kubeProxyVersion: string;
      kubeletVersion: string;
      machineID: string;
      operatingSystem: string;
      osImage: string;
      systemUUID: string;
    };
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

export interface KubeContainerStatus {
  containerID: string;
  image: string;
  imageID: string;
  lastState: string;
  name: string;
  ready: boolean;
  restartCount: number;
  state: {
    running: {
      startedAt: number;
    };
    terminated: {
      containerID: string;
      exitCode: number;
      finishedAt: number;
      message: string;
      reason: string;
      signal: number;
      startedAt: number;
    };
    waiting: {
      message: string;
      reason: string;
    };
  };
}

export interface KubePod extends KubeObject {
  spec: {
    containers: KubeContainer[];
  };
  status: {
    conditions: KubeCondition[];
    containerStatuses: KubeContainerStatus[];
    hostIP: string;
    message: string;
    phase: string;
    qosClass: string;
    reason: string;
    startTime: number;
    [other: string]: any;
  };
}

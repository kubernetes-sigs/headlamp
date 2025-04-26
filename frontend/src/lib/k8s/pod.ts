import { Base64 } from 'js-base64';
import { stream, StreamArgs, StreamResultsCb } from './apiProxy';
import { KubeCondition, KubeContainer, KubeContainerStatus, Time } from './cluster';
import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface KubeVolume {
  name: string;
  [volumeName: string]: any;
}

export interface KubePodSpec {
  containers: KubeContainer[];
  nodeName: string;
  nodeSelector?: {
    [key: string]: string;
  };
  initContainers?: KubeContainer[];
  ephemeralContainers?: KubeContainer[];
  readinessGates?: {
    conditionType: string;
  }[];
  volumes?: KubeVolume[];
  serviceAccountName?: string;
  serviceAccount?: string;
  priority?: string;
  tolerations?: any[];
}

export interface KubePod extends KubeObjectInterface {
  spec: KubePodSpec;
  status: {
    conditions: KubeCondition[];
    containerStatuses: KubeContainerStatus[];
    initContainerStatuses?: KubeContainerStatus[];
    ephemeralContainerStatuses?: KubeContainerStatus[];
    hostIP?: string;
    message?: string;
    phase: string;
    qosClass?: string;
    reason?: string;
    startTime: Time;
    [other: string]: any;
  };
}

export interface ExecOptions extends StreamArgs {
  command?: string[];
}

export interface LogOptions {
  /** The number of lines to display from the end side of the log */
  tailLines?: number;
  /** Whether to show the logs from previous runs of the container (only for restarted containers) */
  showPrevious?: boolean;
  /** Whether to show the timestamps in the logs */
  showTimestamps?: boolean;
  /** Whether to follow the log stream */
  follow?: boolean;
  /** Callback to be called when the reconnection attempts stop */
  onReconnectStop?: () => void;
}

/**@deprecated
 * Use `container: string, onLogs: StreamResultsCb, logsOptions: LogOptions`
 * */
type oldGetLogs = (
  container: string,
  tailLines: number,
  showPrevious: boolean,
  onLogs: StreamResultsCb
) => () => void;
type newGetLogs = (
  container: string,
  onLogs: StreamResultsCb,
  logsOptions: LogOptions
) => () => void;

type PodDetailedStatus = {
  restarts: number;
  reason: string;
  message: string;
  totalContainers: number;
  readyContainers: number;
  lastRestartDate: Date;
};

class Pod extends KubeObject<KubePod> {
  static kind = 'Pod';
  static apiName = 'pods';
  static apiVersion = 'v1';
  static isNamespaced = true;

  protected detailedStatusCache: Partial<{ resourceVersion: string; details: PodDetailedStatus }>;

  constructor(jsonData: KubePod, cluster?: string) {
    super(jsonData, cluster);
    this.detailedStatusCache = {};
  }

  get spec(): KubePod['spec'] {
    return this.jsonData.spec;
  }

  get status(): KubePod['status'] {
    return this.jsonData.status;
  }

  getLogs(...args: Parameters<oldGetLogs | newGetLogs>): () => void {
    if (args.length > 3) {
      console.warn(
        "This Pod's getLogs use will soon be deprecated! Please double check how to call the getLogs function."
      );
      const [container, tailLines, showPrevious, onLogs] = args as Parameters<oldGetLogs>;
      return this.getLogs(container, onLogs!, {
        tailLines: tailLines,
        showPrevious: showPrevious,
      });
    }

    let isReconnecting = true; // Flag to track reconnection attempts
    const [container, onLogs, logsOptions] = args as Parameters<newGetLogs>;
    const {
      tailLines = 100,
      showPrevious = false,
      showTimestamps = false,
      follow = true,
      onReconnectStop,
    } = logsOptions;

    let logs: string[] = [];
    let url = `/api/v1/namespaces/${this.getNamespace()}/pods/${this.getName()}/log?container=${container}&previous=${showPrevious}&timestamps=${showTimestamps}&follow=${follow}`;

    // Negative tailLines parameter fetches all logs. If it's non negative it fetches
    // the tailLines number of logs.
    if (tailLines !== -1) {
      url += `&tailLines=${tailLines}`;
    }

    function onResults(item: string) {
      if (!item) {
        return;
      }

      logs.push(Base64.decode(item));
      onLogs(logs);
    }

    const { cancel } = stream(url, onResults, {
      isJson: false,
      connectCb: () => {
        logs = [];
      },
      /**
       * This callback is called when the connection is closed. It then check
       * if the connection was closed due to an error or not. If it was closed
       * due to an error, it stops further reconnection attempts.
       */
      failCb: () => {
        // If it's a reconnection attempt, stop further reconnection attempts
        if (follow && isReconnecting) {
          isReconnecting = false;

          // If the onReconnectStop callback is provided, call it
          if (onReconnectStop) {
            onReconnectStop();
          }
        }
      },
    });

    return cancel;
  }

  attach(container: string, onAttach: StreamResultsCb, options: StreamArgs = {}) {
    const url = `/api/v1/namespaces/${this.getNamespace()}/pods/${this.getName()}/attach?container=${container}&stdin=true&stderr=true&stdout=true&tty=true`;
    const additionalProtocols = [
      'v4.channel.k8s.io',
      'v3.channel.k8s.io',
      'v2.channel.k8s.io',
      'channel.k8s.io',
    ];

    return stream(url, onAttach, { additionalProtocols, isJson: false, ...options });
  }

  exec(container: string, onExec: StreamResultsCb, options: ExecOptions = {}) {
    const { command = ['sh'], ...streamOpts } = options;
    const { tty = true, stdin = true, stdout = true, stderr = true } = streamOpts;
    const commandStr = command.map(item => '&command=' + encodeURIComponent(item)).join('');
    const url = `/api/v1/namespaces/${this.getNamespace()}/pods/${this.getName()}/exec?container=${container}${commandStr}&stdin=${
      stdin ? 1 : 0
    }&stderr=${stderr ? 1 : 0}&stdout=${stdout ? 1 : 0}&tty=${tty ? 1 : 0}`;
    const additionalProtocols = [
      'v4.channel.k8s.io',
      'v3.channel.k8s.io',
      'v2.channel.k8s.io',
      'channel.k8s.io',
    ];

    return stream(url, onExec, { additionalProtocols, isJson: false, ...streamOpts });
  }

  private getLastRestartDate(container: KubeContainerStatus, lastRestartDate: Date): Date {
    if (!!container.lastState?.terminated) {
      const terminatedDate = new Date(container.lastState.terminated.finishedAt);
      if (lastRestartDate.getTime() < terminatedDate.getTime()) {
        return terminatedDate;
      }
    }

    return lastRestartDate;
  }

  private hasPodReadyCondition(conditions: any): boolean {
    for (const condition of conditions) {
      if (condition.type === 'Ready' && condition.Status === 'True') {
        return true;
      }
    }
    return false;
  }

  // Implementation based on: https://github.com/kubernetes/kubernetes/blob/7b6293b6b6a5662fc37f440e839cf5da8b96e935/pkg/printers/internalversion/printers.go#L759
  getDetailedStatus(): PodDetailedStatus {
    // We cache this data to avoid going through all this logic when nothing has changed
    if (
      !!this.detailedStatusCache.details &&
      this.detailedStatusCache.resourceVersion === this.jsonData.metadata.resourceVersion
    ) {
      return this.detailedStatusCache.details;
    }

    // We cache this data to avoid going through all this logic when nothing has changed
    if (
      !!this.detailedStatusCache.details &&
      this.detailedStatusCache.resourceVersion === this.jsonData.metadata.resourceVersion
    ) {
      return this.detailedStatusCache.details;
    }

    let restarts = 0;
    const totalContainers = (this.spec.containers ?? []).length;
    let readyContainers = 0;
    let message = '';
    let lastRestartDate = new Date(0);

    let reason = this.status.reason || this.status.phase;

    let initializing = false;
    for (const i in this.status.initContainerStatuses ?? []) {
      const container = this.status.initContainerStatuses![i];
      restarts += container.restartCount;
      lastRestartDate = this.getLastRestartDate(container, lastRestartDate);

      switch (true) {
        case container.state.terminated?.exitCode === 0:
          continue;
        case !!container.state.terminated:
          if (!container.state.terminated!.reason) {
            if (container.state.terminated!.signal !== 0) {
              reason = `Init:Signal:${container.state.terminated!.signal}`;
            } else {
              reason = `Init:ExitCode:${container.state.terminated!.exitCode}`;
            }
          } else {
            reason = 'Init:' + container.state.terminated!.reason;
          }
          message = container.state.terminated!.message || '';
          initializing = true;
          break;
        case !!container.state.waiting?.reason &&
          container.state.waiting.reason !== 'PodInitializing':
          reason = 'Init:' + container.state.waiting!.reason;
          initializing = true;
          message = container.state.waiting!.message || '';
          break;
        default:
          reason = `Init:${i}/${(this.spec.initContainers || []).length}`;
          initializing = true;
      }
      break;
    }

    if (!initializing) {
      restarts = 0;
      let hasRunning = false;
      for (let i = (this.status?.containerStatuses?.length || 0) - 1; i >= 0; i--) {
        const container = this.status?.containerStatuses[i];

        restarts += container.restartCount;
        lastRestartDate = this.getLastRestartDate(container, lastRestartDate);

        if (!!container.state.waiting?.reason) {
          reason = container.state.waiting.reason;
          message = container.state.waiting.message || '';
        } else if (!!container.state.terminated?.reason) {
          reason = container.state.terminated.reason;
          message = container.state.terminated.message || '';
        } else if (container.state.terminated?.reason === '') {
          if (container.state.terminated.signal !== 0) {
            reason = `Signal:${container.state.terminated.signal}`;
          } else {
            reason = `ExitCode:${container.state.terminated.exitCode}`;
          }
          message = container.state.terminated.message || '';
        } else if (container.ready && !!container.state.running) {
          hasRunning = true;
          readyContainers++;
        }
      }

      // change pod status back to "Running" if there is at least one container still reporting as "Running" status
      if (reason === 'Completed' && hasRunning) {
        if (this.hasPodReadyCondition(this.status?.conditions)) {
          reason = 'Running';
        } else {
          reason = 'NotReady';
        }
      }
    }

    // Instead of `pod.deletionTimestamp`. Important!
    const deletionTimestamp = this.metadata.deletionTimestamp;

    if (!!deletionTimestamp && this.status?.reason === 'NodeLost') {
      reason = 'Unknown';
    } else if (!!deletionTimestamp) {
      reason = 'Terminating';
    }

    const newDetails = {
      restarts,
      totalContainers,
      readyContainers,
      reason,
      lastRestartDate,
      message,
    };

    this.detailedStatusCache = {
      resourceVersion: this.jsonData.metadata.resourceVersion,
      details: newDetails,
    };

    return newDetails;
  }
}

export default Pod;

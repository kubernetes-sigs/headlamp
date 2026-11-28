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

import { Base64 } from 'js-base64';
import { patch, post } from './api/v1/clusterRequests';
import type { StreamArgs, StreamResultsCb } from './api/v1/streamingApi';
import { stream } from './api/v1/streamingApi';
import type { KubeContainer, KubeContainerStatus, PodCondition, Time } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import type { WorkloadHealthCategory } from './Workload';

/** Container waiting/terminated reasons that represent a genuine failure rather than normal startup. */
const POD_FAILED_CONTAINER_REASONS = [
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'ErrImageNeverPull',
  'InvalidImageName',
  'CreateContainerError',
  'CreateContainerConfigError',
  'RunContainerError',
  'OOMKilled',
  'Error',
  'ContainerCannotRun',
  'DeadlineExceeded',
];

export interface KubeVolume {
  name: string;
  [volumeName: string]: any;
}

export interface PodResourceClaim {
  name: string;
  resourceClaimName?: string;
  resourceClaimTemplateName?: string;
}

export interface PodResourceClaimStatus {
  name: string;
  resourceClaimName?: string;
}

export interface PodExtendedResourceClaimStatus {
  resourceClaimName: string;
  requestMappings: {
    containerName: string;
    resourceName: string;
    requestName: string;
  }[];
}

export interface PodClaimReference {
  source: 'claim' | 'template' | 'extendedResource';
  podClaimName?: string;
  claimName?: string;
  templateName?: string;
  containers: string[];
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
  priority?: number;
  priorityClassName?: string;
  runtimeClassName?: string;
  /** Resources reserved for the pod sandbox, populated from its RuntimeClass at admission. */
  overhead?: Record<string, string>;
  terminationGracePeriodSeconds?: number;
  tolerations?: any[];
  restartPolicy?: string;
  /**
   * The scheduling group this Pod belongs to. Set only when the GenericWorkload
   * feature gate is enabled on the cluster.
   */
  schedulingGroup?: {
    podGroupName: string;
  };
  resourceClaims?: PodResourceClaim[];
}

export interface KubePod extends KubeObjectInterface {
  spec: KubePodSpec;
  status: {
    conditions: PodCondition[];
    containerStatuses: KubeContainerStatus[];
    initContainerStatuses?: KubeContainerStatus[];
    ephemeralContainerStatuses?: KubeContainerStatus[];
    hostIP?: string;
    hostIPs?: { ip: string }[];
    podIPs?: { ip: string }[];
    message?: string;
    phase: string;
    qosClass?: string;
    reason?: string;
    nominatedNodeName?: string;
    startTime: Time;
    resourceClaimStatuses?: PodResourceClaimStatus[];
    extendedResourceClaimStatus?: PodExtendedResourceClaimStatus;
    [other: string]: any;
  };
}

export interface ExecOptions extends StreamArgs {
  command?: string[];
}

export interface LogOptions {
  /** The number of lines to display from the end side of the log */
  tailLines?: number;
  /** Only return logs newer than this many seconds. Leave unset to not limit by time. */
  sinceSeconds?: number;
  /** Whether to show the logs from previous runs of the container (only for restarted containers) */
  showPrevious?: boolean;
  /** Whether to show the timestamps in the logs */
  showTimestamps?: boolean;
  /** Whether to follow the log stream */
  follow?: boolean;
  /** Whether to prettify JSON logs with formatted indentation */
  prettifyLogs?: boolean;
  /** Whether to format JSON string values by unescaping string literals */
  formatJsonValues?: boolean;
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
  onLogs: LogStreamResultsCb,
  logsOptions: LogOptions
) => () => void;
type LogStreamResultsCb = (result: { logs: string[]; hasJsonLogs: boolean }) => void;

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

  get resourceClaims(): PodClaimReference[] {
    const containers = [...(this.spec?.initContainers ?? []), ...(this.spec?.containers ?? [])];
    const containersUsing = (claim: string) =>
      containers
        .filter(container => container.resources?.claims?.some(used => used.name === claim))
        .map(container => container.name);

    const references: PodClaimReference[] = (this.spec?.resourceClaims ?? []).map(claim => {
      if (claim.resourceClaimName) {
        return {
          source: 'claim',
          podClaimName: claim.name,
          claimName: claim.resourceClaimName,
          containers: containersUsing(claim.name),
        };
      }
      return {
        source: 'template',
        podClaimName: claim.name,
        claimName: this.status?.resourceClaimStatuses?.find(status => status.name === claim.name)
          ?.resourceClaimName,
        templateName: claim.resourceClaimTemplateName,
        containers: containersUsing(claim.name),
      };
    });

    const extended = this.status?.extendedResourceClaimStatus;
    if (extended?.resourceClaimName) {
      references.push({
        source: 'extendedResource',
        claimName: extended.resourceClaimName,
        containers: [
          ...new Set((extended.requestMappings ?? []).map(mapping => mapping.containerName)),
        ],
      });
    }
    return references;
  }

  evict() {
    const url = `/api/v1/namespaces/${this.getNamespace()}/pods/${this.getName()}/eviction`;
    return post(
      url,
      {
        metadata: {
          name: this.getName(),
          namespace: this.getNamespace(),
        },
      },
      true,
      { cluster: this._clusterName }
    );
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

    const self = this;
    const [container, onLogs, logsOptions] = args as Parameters<newGetLogs>;
    const {
      tailLines = 100,
      sinceSeconds,
      showPrevious = false,
      showTimestamps = false,
      follow = true,
      prettifyLogs = false,
      formatJsonValues = false,
      onReconnectStop,
    } = logsOptions;

    const logs: string[] = [];
    let hasJsonLogs = false;
    let lastTimestamp = '';
    let isCancelled = false;
    let activeCancel: (() => void) | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let partialLineBuffer = '';
    // The backend base64-encodes each message on its own, so a multibyte character can be
    // split across two of them. Decode as a stream, from a new decoder for each connection.
    let decoder = new TextDecoder();
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const stableConnectionMs = 10_000;
    // Raw records rendered at lastTimestamp, and the latest ones a reconnect replayed there.
    let shownAtResumePoint: string[] = [];
    let replayedAtResumePoint: string[] = [];
    // Set once the replay has sent shownAtResumePoint again, so later records are new.
    let replayedShownRecords = false;
    // True after a reconnect until the records replayed from sinceTime have been skipped.
    let isReplaying = false;
    // When the first request was made, so a reconnect before any record has arrived resumes
    // from there, rather than requesting the tail again and leaving out the records produced
    // during the outage. Rounded down to seconds, the precision of sinceTime.
    let startTime = '';
    // Kubernetes only prefixes records with a timestamp when it was requested.
    const hasTimestampPrefix = follow || showTimestamps;
    const timestampPrefix =
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})) /;

    function unescapeStringLiterals(str: string): string {
      return str
        .replace(/\\r\\n/g, '\r\n') // Carriage return + newline
        .replace(/\\n/g, '\n') // Newline
        .replace(/\\t/g, '\t') // Tab
        .replace(/\\"/g, '"') // Double quote
        .replace(/\\'/g, "'") // Single quote
        .replace(/\\\\/g, '\\'); // Backslash
    }

    function prettifyLogLine(logLine: string): string {
      try {
        const jsonMatch = logLine.match(/(\{.*\})/);
        if (!jsonMatch) return logLine;

        const jsonStr = jsonMatch[1];
        const jsonObj = JSON.parse(jsonStr);

        const valueReplacer = formatJsonValues
          ? (key: string, value: any) =>
              typeof value === 'string' ? unescapeStringLiterals(value) : value
          : undefined;

        const prettyJson = JSON.stringify(jsonObj, valueReplacer, 2);
        const terminalReadyJson = formatJsonValues
          ? unescapeStringLiterals(prettyJson)
          : prettyJson;

        if (showTimestamps) {
          const timestamp = logLine.slice(0, jsonMatch.index).trim();
          return timestamp ? `${timestamp}\n${terminalReadyJson}` : `${terminalReadyJson}`;
        } else {
          return `${terminalReadyJson}`;
        }
      } catch {
        return logLine; // Return original log line if parsing fails
      }
    }

    function splitTimestamp(line: string): [timestamp: string, text: string] {
      const match = hasTimestampPrefix ? line.match(timestampPrefix) : null;
      return match ? [match[1], line.slice(match[0].length)] : ['', line];
    }

    function displayLine(line: string): string {
      let processed = showTimestamps ? line : splitTimestamp(line)[1];

      // Check if this line contains JSON
      if (processed.trim().match(/(\{.*\})/)) {
        hasJsonLogs = true;
        if (prettifyLogs) {
          processed = prettifyLogLine(processed);
        }
      }
      return processed;
    }

    /** Splits an RFC 3339 timestamp so it can be ordered at nanosecond precision. */
    function timestampKey(timestamp: string): [seconds: number, fraction: string] {
      const [, seconds, fraction = '', zone] =
        timestamp.match(/^(.*?)(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/) || [];
      return [Date.parse(seconds + zone), fraction.padEnd(9, '0')];
    }

    function isAfterResumePoint(timestamp: string): boolean {
      const [seconds, fraction] = timestampKey(timestamp);
      const [lastSeconds, lastFraction] = timestampKey(lastTimestamp);
      return seconds !== lastSeconds ? seconds > lastSeconds : fraction > lastFraction;
    }

    function isAtResumePoint(timestamp: string): boolean {
      const [seconds, fraction] = timestampKey(timestamp);
      const [lastSeconds, lastFraction] = timestampKey(lastTimestamp);
      return seconds === lastSeconds && fraction === lastFraction;
    }

    /**
     * Reports whether a record is part of the replay a reconnect receives. sinceTime is
     * sent to the kubelet with second precision, so the replay can start with records
     * from earlier in that second and may span several callbacks. Records at the resume
     * timestamp are skipped until the ones already shown there have been replayed, in
     * order, so a new one after them is shown. Earlier ones the initial tail left out are
     * skipped with them. If identical records precede that run, the earliest match is
     * taken, so one of them may be shown again.
     */
    function isReplayed(line: string): boolean {
      if (!isReplaying) return false;
      const [timestamp] = splitTimestamp(line);
      if (timestamp && !isAfterResumePoint(timestamp)) {
        if (!isAtResumePoint(timestamp)) return true;
        if (!replayedShownRecords) {
          replayedAtResumePoint = [...replayedAtResumePoint, line].slice(
            -shownAtResumePoint.length
          );
          replayedShownRecords =
            replayedAtResumePoint.length === shownAtResumePoint.length &&
            replayedAtResumePoint.every((r, i) => r === shownAtResumePoint[i]);
          return true;
        }
      }
      isReplaying = false;
      return false;
    }

    function onResults(item: string) {
      if (!item) return;

      const decodedLog = decoder.decode(Base64.toUint8Array(item), { stream: true });
      if (!decodedLog) return;

      const linesList = (partialLineBuffer + decodedLog).split('\n');

      // The last element is either empty (if it ended with \n) or the partial line, which is
      // held back until its newline, so every entry is a whole record.
      partialLineBuffer = linesList.pop() || '';

      const newLines = linesList.filter(line => !isReplayed(line));
      const rendered: string[] = [];

      for (const line of newLines) {
        rendered.push(displayLine(line) + '\n');

        const [timestamp] = splitTimestamp(line);
        if (timestamp && lastTimestamp && isAtResumePoint(timestamp)) {
          shownAtResumePoint.push(line);
        } else if (timestamp) {
          lastTimestamp = timestamp;
          shownAtResumePoint = [line];
        }
      }

      if (newLines.length > 0) {
        // Only records that survive replay suppression count as progress.
        reconnectAttempts = 0;
      }

      logs.push(...rendered);
      onLogs({ logs, hasJsonLogs });
    }

    function connect() {
      if (isCancelled) return;

      decoder = new TextDecoder();

      // Always request timestamps when following so we can extract the last timestamp for reconnection.
      // For one-shot (non-follow) log fetches, respect showTimestamps to avoid extra payload/processing.
      const timestampsParam = follow ? 'true' : String(showTimestamps);
      let currentUrl = `/api/v1/namespaces/${self.getNamespace()}/pods/${self.getName()}/log?container=${container}&previous=${showPrevious}&timestamps=${timestampsParam}&follow=${follow}`;
      if (lastTimestamp) {
        currentUrl += `&sinceTime=${encodeURIComponent(lastTimestamp)}`;
      } else if (startTime) {
        currentUrl += `&sinceTime=${encodeURIComponent(startTime)}`;
      } else {
        // The API rejects sinceSeconds with sinceTime, so only the first request uses it.
        const hasSinceSeconds = sinceSeconds !== undefined && sinceSeconds > 0;
        if (hasSinceSeconds) {
          currentUrl += `&sinceSeconds=${sinceSeconds}`;
        }
        if (tailLines !== -1) {
          currentUrl += `&tailLines=${tailLines}`;
        }
        if (hasSinceSeconds || tailLines !== -1) {
          startTime = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        }
      }

      const isReconnectAttempt = reconnectAttempts > 0;
      isReplaying = Boolean(lastTimestamp);
      replayedAtResumePoint = [];
      replayedShownRecords = shownAtResumePoint.length === 0;
      let reconnectBannerShown = false;
      // When this connection's socket opened, to tell one that worked from one that failed.
      let openedAt = 0;

      const { cancel } = stream(
        currentUrl,
        (item: string) => {
          if (!reconnectBannerShown && isReconnectAttempt) {
            reconnectBannerShown = true;
            logs.push('\n\x1b[32m[Reconnected!]\x1b[0m\n');
            onLogs({ logs, hasJsonLogs });
          }
          onResults(item);
        },
        {
          cluster: self.cluster,
          isJson: false,
          reconnectOnFailure: false, // Handle reconnection ourselves
          openCb: () => {
            openedAt = Date.now();
          },
          failCb: (event?: CloseEvent) => {
            if (isCancelled) return;
            // The server closing the socket after sending the requested logs is expected when
            // not following, and when the API server ends a followed stream with a normal close,
            // e.g. for previous logs or a container that exited. Only other closes reconnect.
            if (!follow || event?.code === 1000) {
              // Flush a final log line that arrived without a trailing newline.
              partialLineBuffer += decoder.decode();
              if (partialLineBuffer && !isReplayed(partialLineBuffer)) {
                logs.push(displayLine(partialLineBuffer) + '\n');
                onLogs({ logs, hasJsonLogs });
              }
              partialLineBuffer = '';
              if (follow && onReconnectStop) {
                onReconnectStop();
              }
              return;
            }
            // The reconnect replays this record in full. If no record was complete yet, resume
            // from this one, as from when the stream started would leave out the first tail.
            if (!lastTimestamp) {
              const [timestamp] = splitTimestamp(partialLineBuffer);
              if (timestamp) {
                lastTimestamp = timestamp;
                shownAtResumePoint = [];
              }
            }
            partialLineBuffer = '';
            // A connection that stayed open for a while used none of the budget, even when it
            // only replayed records already shown or sent none, e.g. a quiet stream an idle
            // timeout keeps closing.
            if (openedAt && Date.now() - openedAt >= stableConnectionMs) {
              reconnectAttempts = 0;
            }

            if (reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++;
              logs.push(
                `\n\x1b[33m[Connection lost. Reconnecting... (attempt ${reconnectAttempts}/${maxReconnectAttempts})]\x1b[0m\n`
              );
              onLogs({ logs, hasJsonLogs });
              if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
              }
              reconnectTimeout = setTimeout(connect, 3000);
            } else {
              logs.push(
                '\n\x1b[31m[Connection lost. Reconnection limit reached. Reconnect stopped.]\x1b[0m\n'
              );
              onLogs({ logs, hasJsonLogs });
              if (onReconnectStop) {
                onReconnectStop();
              }
            }
          },
        }
      );

      activeCancel = cancel;
    }

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (activeCancel) {
        activeCancel();
      }
    };
  }

  attach(container: string, onAttach: StreamResultsCb, options: StreamArgs = {}) {
    const url = `/api/v1/namespaces/${this.getNamespace()}/pods/${this.getName()}/attach?container=${container}&stdin=true&stderr=true&stdout=true&tty=true`;
    const additionalProtocols = [
      'v4.channel.k8s.io',
      'v3.channel.k8s.io',
      'v2.channel.k8s.io',
      'channel.k8s.io',
    ];

    return stream(url, onAttach, {
      cluster: this.cluster,
      additionalProtocols,
      isJson: false,
      ...options,
    });
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

    return stream(url, onExec, {
      cluster: this.cluster,
      additionalProtocols,
      isJson: false,
      ...streamOpts,
    });
  }

  /**
   * Add an ephemeral container to the pod.
   * @param containerName - The name of the ephemeral container to add
   * @param image - The container image to use
   * @param command - Optional command to run in the container (defaults to ['sh'])
   * @param targetContainerName - Optional name of the container to target.
   *   When set, the ephemeral container shares the target's namespaces (PID, IPC, etc.).
   *   If undefined, no targeting is applied.
   * @returns Promise that resolves when the ephemeral container is added
   */
  async addEphemeralContainer(
    containerName: string,
    image: string,
    command: string[] = ['sh'],
    targetContainerName?: string
  ): Promise<void> {
    const ephemeralContainer: KubeContainer = {
      name: containerName,
      image,
      tty: true,
      stdin: true,
      stdinOnce: true,
      command,
      imagePullPolicy: 'IfNotPresent',
      ...(targetContainerName ? { targetContainerName } : {}),
    };

    // Get current ephemeral containers
    const currentEphemeralContainers = this.spec?.ephemeralContainers || [];

    // Prepare the patch body
    const patchBody = {
      spec: {
        ephemeralContainers: [...currentEphemeralContainers, ephemeralContainer],
      },
    };

    const url = `/api/v1/namespaces/${this.getNamespace()}/pods/${this.getName()}/ephemeralcontainers`;

    await patch(url, patchBody, true, { cluster: this.cluster });
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

  private isRestartableInitContainer(spec?: KubeContainer): boolean {
    return !!spec && (spec as any).restartPolicy === 'Always';
  }

  private isPodInitializedConditionTrue(status?: KubePod['status']): boolean {
    for (const c of status?.conditions ?? []) {
      if (c.type === 'Initialized' && c.status === 'True') {
        return true;
      }
    }
    return false;
  }

  private hasPodReadyCondition(conditions: PodCondition[]): boolean {
    for (const condition of conditions) {
      if (condition.type === 'Ready' && condition.status === 'True') {
        return true;
      }
    }
    return false;
  }

  // Implementation based on: https://github.com/kubernetes/kubernetes/blob/67216cfdd980cdd0234866d66a9ffe2ba3d8fcc4/pkg/printers/internalversion/printers.go#L891
  getDetailedStatus(): PodDetailedStatus {
    // We cache this data to avoid going through all this logic when nothing has changed
    if (
      !!this.detailedStatusCache.details &&
      this.detailedStatusCache.resourceVersion === this.jsonData.metadata.resourceVersion
    ) {
      return this.detailedStatusCache.details;
    }

    let restarts = 0;
    let restartableInitContainerRestarts = 0;
    let readyContainers = 0;
    let message = '';
    let lastRestartDate = new Date(0);
    let lastRestartableInitContainerRestartDate = new Date(0);

    let reason = this.status?.reason || this.status?.phase || 'Unknown';

    const initContainers: Record<string, KubeContainer> = {};
    let totalContainers = (this.spec?.containers ?? []).length;
    for (const ic of this.spec?.initContainers ?? []) {
      initContainers[ic.name] = ic;
      if (this.isRestartableInitContainer(ic)) {
        totalContainers++;
      }
    }

    let initializing = false;
    const initContainerStatuses = this.status?.initContainerStatuses ?? [];
    for (const i in initContainerStatuses) {
      const container = initContainerStatuses[i];
      restarts += container.restartCount;
      lastRestartDate = this.getLastRestartDate(container, lastRestartDate);

      if (
        container.lastState?.terminated !== null &&
        container.lastState?.terminated !== undefined
      ) {
        const terminatedDate = container.lastState.terminated?.finishedAt
          ? new Date(container.lastState.terminated?.finishedAt)
          : undefined;
        if (!!terminatedDate && lastRestartDate < terminatedDate) {
          lastRestartDate = terminatedDate;
        }
      }

      if (this.isRestartableInitContainer(initContainers[container.name])) {
        restartableInitContainerRestarts += container.restartCount;
        if (
          container.lastState?.terminated !== null &&
          container.lastState?.terminated !== undefined
        ) {
          const terminatedDate = container.lastState.terminated?.finishedAt
            ? new Date(container.lastState.terminated?.finishedAt)
            : undefined;
          if (!!terminatedDate && lastRestartableInitContainerRestartDate < terminatedDate) {
            lastRestartableInitContainerRestartDate = terminatedDate;
          }
        }
      }

      switch (true) {
        case container.state.terminated?.exitCode === 0:
          continue;
        case !!container.started && this.isRestartableInitContainer(initContainers[container.name]):
          if (container.ready) {
            readyContainers++;
          }
          continue;
        case !!container.state.terminated:
          if (!container.state.terminated!.reason) {
            if (container.state.terminated!.signal) {
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
          reason = `Init:${i}/${(this.spec?.initContainers || []).length}`;
          initializing = true;
      }
      break;
    }

    if (!initializing || this.isPodInitializedConditionTrue(this.status)) {
      restarts = restartableInitContainerRestarts;
      lastRestartDate = lastRestartableInitContainerRestartDate;
      let hasRunning = false;
      // Reason and message of a container that exited with a non-zero code, if any
      let errorReason = '';
      let errorMessage = '';
      for (let i = (this.status?.containerStatuses?.length || 0) - 1; i >= 0; i--) {
        const container = this.status?.containerStatuses?.[i];

        restarts += container.restartCount;
        lastRestartDate = this.getLastRestartDate(container, lastRestartDate);

        if (!!container.state.waiting?.reason) {
          reason = container.state.waiting.reason;
          message = container.state.waiting.message || '';
        } else if (!!container.state.terminated) {
          if (!!container.state.terminated.reason) {
            reason = container.state.terminated.reason;
          } else if (container.state.terminated.signal) {
            reason = `Signal:${container.state.terminated.signal}`;
          } else {
            reason = `ExitCode:${container.state.terminated.exitCode}`;
          }
          message = container.state.terminated.message || '';
          if (container.state.terminated.exitCode !== 0) {
            errorReason = reason;
            errorMessage = message;
          }
        } else if (container.ready && !!container.state.running) {
          hasRunning = true;
          readyContainers++;
        }
      }

      // A "Completed" container should not hide a running or failed one, as in kubectl:
      // https://github.com/kubernetes/kubernetes/pull/124766
      if (reason === 'Completed') {
        if (hasRunning && this.hasPodReadyCondition(this.status?.conditions ?? [])) {
          reason = 'Running';
        } else if (errorReason) {
          reason = errorReason;
          message = errorMessage;
        } else if (hasRunning) {
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

  /**
   * Classifies the pod into a coarse health category for the Workloads overview
   * chart. Pods have no replica fields, so the replica-mismatch logic used for
   * other workloads can't apply. This relies on the same signals the Pods list
   * shows (phase, readiness, container state, deletionTimestamp) so the chart
   * and the list can't disagree. Terminating and Pending pods are treated as
   * transitional rather than failures.
   */
  getHealth(): WorkloadHealthCategory {
    // A lost node is reported as Unknown (unhealthy), matching getDetailedStatus.
    if (this.metadata.deletionTimestamp) {
      return this.status?.reason === 'NodeLost' ? 'failed' : 'transitional';
    }

    const phase = this.status?.phase;
    if (phase === 'Succeeded') {
      return 'healthy';
    }

    const containerStatuses = [
      ...(this.status?.containerStatuses || []),
      ...(this.status?.initContainerStatuses || []),
    ];
    // Failures surface either as a waiting reason (CrashLoopBackOff, ImagePull…)
    // or as the current terminated reason (Error, OOMKilled…). lastState is
    // intentionally ignored so a container that already recovered isn't flagged.
    const hasFailingContainer = containerStatuses.some(cs => {
      const terminated = cs.state?.terminated;
      // A container terminated with a non-zero exit code or signal is a failure
      // even when the reason is empty/unspecified, mirroring the ExitCode:/Signal:
      // handling in getDetailedStatus.
      if (terminated && (terminated.exitCode || terminated.signal)) {
        return true;
      }
      const reason = cs.state?.waiting?.reason || terminated?.reason;
      return !!reason && POD_FAILED_CONTAINER_REASONS.includes(reason);
    });
    if (phase === 'Failed' || hasFailingContainer) {
      return 'failed';
    }

    // Pending without a failing container is still starting up (scheduling,
    // ContainerCreating, PodInitializing, …).
    if (phase === 'Pending') {
      return 'transitional';
    }

    const isReady = (this.status?.conditions || []).some(
      condition => condition.type === 'Ready' && condition.status === 'True'
    );
    if (phase === 'Running') {
      return isReady ? 'healthy' : 'degraded';
    }

    // Unknown / NodeLost and anything else we can't place is treated as failed.
    return 'failed';
  }

  static getBaseObject(): KubePod {
    const baseObject = super.getBaseObject() as KubePod;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
      labels: { app: 'headlamp' },
    };
    baseObject.spec = {
      containers: [
        {
          name: '',
          image: '',
          ports: [{ containerPort: 80 }],
          imagePullPolicy: 'Always',
        },
      ],
      nodeName: '',
    };

    return baseObject;
  }
}

export default Pod;

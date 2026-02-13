import { KubeObject } from '@kinvolk/headlamp-plugin/lib/k8s/cluster';

// -------------------------------------------------------------------

export class ClusterQueue extends KubeObject {
  static kind = 'ClusterQueue';
  static apiName = 'clusterqueues';
  static apiVersion = 'kueue.x-k8s.io/v1beta1';
  static isNamespaced = false;

  get usageParams() {
    return (this as any).status?.flavorsUsage || [];
  }
}

// 2. LocalQueue
export class LocalQueue extends KubeObject {
  static kind = 'LocalQueue';
  static apiName = 'localqueues';
  static apiVersion = 'kueue.x-k8s.io/v1beta1';
  static isNamespaced = true;
}

// 3. Workload
export class Workload extends KubeObject {
  static kind = 'Workload';
  static apiName = 'workloads';
  static apiVersion = 'kueue.x-k8s.io/v1beta1';
  static isNamespaced = true;

  get isPending() {
    // 1. Check if it is actually finished (succeeded or failed)
    const finished = (this as any).status?.conditions?.find(
      (c: any) => c.type === 'Finished' && c.status === 'True'
    );
    if (finished) return false;

    // 2. Check if it is Admitted
    const admitted = (this as any).status?.conditions?.find((c: any) => c.type === 'Admitted');

    // If not admitted yet, OR admitted is explicitly False, it is Pending.
    return !admitted || admitted.status === 'False';
  }

  get pendingReason() {
    const admitted = (this as any).status?.conditions?.find((c: any) => c.type === 'Admitted');

    if (admitted && admitted.status === 'False') {
      return `${admitted.reason}: ${admitted.message}`;
    }

    return 'Waiting for Quota...';
  }
}

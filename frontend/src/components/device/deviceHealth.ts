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

import type { ResourceHealth } from '../../lib/k8s/cluster';
import type Pod from '../../lib/k8s/pod';
import type ResourceClaim from '../../lib/k8s/resourceClaim';
import type { DeviceRequestAllocationResult } from '../../lib/k8s/resourceClaim';
import { splitAllocatedRequest } from './allocatedRequest';

/**
 * The health the Pods using a claim report for one of its allocated devices.
 * @param result - The allocated device.
 * @param claim - The claim the device is allocated to.
 * @param pods - The Pods using the claim.
 * @returns Unhealthy if any Pod says so, else Healthy, else what is reported, if anything.
 */
export function getDeviceHealth(
  result: DeviceRequestAllocationResult,
  claim: ResourceClaim,
  pods: Pod[]
): ResourceHealth | undefined {
  const resourceID = `${result.driver}/${result.pool}/${result.device}`;
  const request = splitAllocatedRequest(result.request).request;
  const devicesFor = (statusRequest?: string) =>
    claim.allocatedDevices.filter(
      device => !statusRequest || splitAllocatedRequest(device.request).request === statusRequest
    );

  const reports = pods.flatMap(pod => {
    const podClaimNames = pod.resourceClaims
      .filter(reference => reference.claimName === claim.getName())
      .map(reference => reference.podClaimName);

    return [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])]
      .flatMap(status => status.allocatedResourcesStatus ?? [])
      .flatMap(status => {
        const [podClaimName, statusRequest] = status.name.replace(/^claim:/, '').split('/');
        if (
          !status.name.startsWith('claim:') ||
          !podClaimNames.includes(podClaimName) ||
          (statusRequest && statusRequest !== request)
        ) {
          return [];
        }
        const resources = status.resources ?? [];
        const exact = resources.filter(resource => resource.resourceID === resourceID);
        if (exact.length) {
          return exact;
        }
        // The kubelet names a device by its first CDI device ID when the driver gives one,
        // so trust such a report only when it can be for no other device.
        return resources.length === 1 && devicesFor(statusRequest).length === 1 ? resources : [];
      });
  });

  return (
    reports.find(report => report.health === 'Unhealthy') ??
    reports.find(report => report.health === 'Healthy') ??
    reports[0]
  );
}

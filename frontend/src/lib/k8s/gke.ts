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

import { Cluster } from './cluster';

/**
 * Determines if a cluster is a GKE (Google Kubernetes Engine) cluster
 * based on its server URL.
 *
 * @param cluster - The cluster object or cluster name
 * @returns true if the cluster appears to be a GKE cluster
 */
export function isGKECluster(cluster: Cluster | string | null): boolean {
  if (!cluster) {
    return false;
  }

  // If cluster is a string (cluster name), we can't determine from name alone
  if (typeof cluster === 'string') {
    return false;
  }

  // Check if cluster has a server property
  const serverUrl = cluster.server || '';

  if (!serverUrl) {
    return false;
  }

  const lowerUrl = serverUrl.toLowerCase();

  // GKE clusters have servers at *.googleapis.com or container.cloud.google.com
  return lowerUrl.includes('.googleapis.com') || lowerUrl.includes('container.cloud.google.com');
}

/**
 * Initiates the GCP OAuth login flow for a GKE cluster.
 *
 * @param clusterName - The name of the cluster to authenticate to
 */
export function initiateGCPLogin(clusterName: string): void {
  const loginUrl = `/gcp-auth/login?cluster=${encodeURIComponent(clusterName)}`;
  window.location.href = loginUrl;
}

/**
 * Checks if GCP OAuth is enabled in the backend.
 *
 * @returns Promise that resolves to true if GCP OAuth is enabled
 */
export async function isGCPOAuthEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/gcp-auth/enabled');
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.enabled === true;
  } catch (error) {
    console.warn('Failed to check GCP OAuth status:', error);
    return false;
  }
}

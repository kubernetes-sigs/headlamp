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

/**
 * Result of a rollback operation on a workload resource.
 *
 * @see {@link https://github.com/kubernetes/kubectl/blob/master/pkg/polymorphichelpers/rollback.go | kubectl rollback implementation}
 */
export interface RollbackResult {
  success: boolean;
  message: string;
  previousRevision?: number;
}

/**
 * Represents a single revision in the history of a rollbackable resource.
 * Used by RevisionHistorySection and RollbackDialog to display revision details.
 */
export interface RevisionInfo {
  /** Revision number */
  revision: number;
  /** When this revision was created */
  createdAt: string;
  /** Container images in this revision's pod template */
  images: string[];
  /** Whether this is the current (active) revision */
  isCurrent: boolean;
  /** The raw pod template spec from this revision, for diffing */
  podTemplate?: {
    metadata?: { [key: string]: any };
    spec?: { [key: string]: any };
  };
}

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
 * Error with additional information about the request that casued it
 * Used for backend response error handling
 */
export class ApiError extends Error {
  /** HTTP status code of the error */
  public status?: number;
  /** Namespace of the requested resource */
  public namespace?: string;
  /** Cluster name */
  public cluster?: string;

  constructor(
    public message: string,
    props?: { status?: number; namespace?: string; cluster?: string }
  ) {
    super(message);
    this.status = props?.status;
    this.namespace = props?.namespace;
    this.cluster = props?.cluster;
  }
}

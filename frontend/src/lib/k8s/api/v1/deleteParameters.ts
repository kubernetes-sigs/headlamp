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

// @todo: QueryParamaters should be specific to different resources.
//        Because some only support some paramaters.

/**
 * DeleteParamaters is a map of delete parameters for the Kubernetes API.
 */
export interface DeleteParameters {
  gracePeriodSeconds?: number;
  /**
   * dryRun causes apiserver to simulate the request, and report whether the object would be modified.
   * Can be '' or 'All'
   *
   * @see https://kubernetes.io/docs/reference/using-api/api-concepts/#dry-run
   */
  dryRun?: string;
}

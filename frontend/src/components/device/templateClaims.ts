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

import type Pod from '../../lib/k8s/pod';

export interface TemplateClaim {
  pod: Pod;
  claimName?: string;
}

/**
 * Finds the claims made from a template, through the Pods that reference it.
 *
 * A generated claim does not point back at its template, so the Pods are the link:
 * each names the template in its spec and the generated claim in its status.
 * @param templateName - The name of the template.
 * @param pods - The Pods in the template's namespace.
 * @returns One entry per Pod claim that uses the template.
 */
export function getClaimsFromTemplate(templateName: string, pods: Pod[]): TemplateClaim[] {
  return pods.flatMap(pod =>
    pod.resourceClaims
      .filter(claim => claim.source === 'template' && claim.templateName === templateName)
      .map(claim => ({ pod, claimName: claim.claimName }))
  );
}

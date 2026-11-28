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

import type HPA from '../../lib/k8s/hpa';
import Link from '../common/Link';

/** Show the declared scale target even when Headlamp has no details route for its kind. */
export function renderHpaReference(hpa: HPA) {
  const targetObject = hpa.referenceObject;
  if (targetObject) {
    return (
      <Link kubeObject={targetObject}>
        {targetObject.kind}/{targetObject.metadata.name}
      </Link>
    );
  }

  const target = hpa.spec?.scaleTargetRef;
  return target?.kind && target.name ? `${target.kind}/${target.name}` : null;
}

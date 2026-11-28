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

import type { ReactNode } from 'react';
import type HPA from '../../lib/k8s/hpa';
import Link from '../common/Link';

/**
 * Extracts the HPA target's kind and name from `spec.scaleTargetRef`, falling
 * back to `referenceObject` only when `scaleTargetRef` is absent.
 * Returns `null` if either kind or name is missing or empty.
 */
export function getHpaScaleTarget(item: HPA): { kind: string; name: string } | null {
  const targetRef = item.spec?.scaleTargetRef;
  const kind = targetRef ? targetRef.kind?.trim() : item.referenceObject?.kind?.trim();
  const name = targetRef ? targetRef.name?.trim() : item.referenceObject?.metadata?.name?.trim();

  if (!kind || !name) {
    return null;
  }

  return { kind, name };
}

/**
 * Renders the HPA scale target reference as a resource link when Headlamp has
 * a resolved `referenceObject`, or as plain `kind/name` text otherwise.
 */
export function renderHpaReference(item: HPA, fallback: ReactNode = null): ReactNode {
  const target = getHpaScaleTarget(item);
  if (!target) {
    return fallback;
  }

  const label = `${target.kind}/${target.name}`;
  if (item.referenceObject) {
    return <Link kubeObject={item.referenceObject}>{label}</Link>;
  }

  return label;
}

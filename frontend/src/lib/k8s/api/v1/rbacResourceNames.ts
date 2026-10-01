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

import { useQuery } from '@tanstack/react-query';
import { getCluster } from '../../../cluster';
import { post } from './clusterRequests';

/** A single rule from a SelfSubjectRulesReview's status.resourceRules. */
interface SelfSubjectRulesReviewResourceRule {
  verbs: string[];
  apiGroups?: string[];
  resources?: string[];
  resourceNames?: string[];
}

/** Response shape of a SelfSubjectRulesReview, as returned by {@link testAuth}. */
export interface SelfSubjectRulesReviewResponse {
  status?: {
    resourceRules?: SelfSubjectRulesReviewResourceRule[];
    incomplete?: boolean;
  };
}

/**
 * Derives the resourceNames restriction from an already-fetched SelfSubjectRulesReview
 * response. Pure/no I/O — callers that already hold a review result (e.g. from a shared
 * cache, such as the one AuthRoute populates via testAuth) should use this directly
 * instead of {@link fetchResourceNamesRestriction}, to avoid firing a second, redundant
 * SelfSubjectRulesReview request for a check that was already performed.
 *
 * @param review - A previously-fetched SelfSubjectRulesReview response.
 * @param apiGroup - API group of the resource (empty string for the core group).
 * @param resource - Plural resource name (e.g. "nodes").
 * @param verb - Verb to check (e.g. "list").
 * @returns
 *  - `null` if access is unrestricted (a matching rule has no resourceNames), or if no
 *    matching rule was found at all — callers should fall back to a normal, unfiltered
 *    request and let the real API call surface any actual permission error.
 *  - A `string[]` of the specific resource names the user is authorized for, when every
 *    matching rule for this apiGroup/resource/verb carries a resourceNames restriction.
 */
export function extractResourceNamesRestriction(
  review: SelfSubjectRulesReviewResponse,
  apiGroup: string,
  resource: string,
  verb: string
): string[] | null {
  if (review.status?.incomplete) {
    // The API server couldn't fully evaluate the rules (e.g. an aggregated API server
    // didn't respond) — don't guess at a restriction, fall back to a normal request.
    return null;
  }

  const rules = review.status?.resourceRules ?? [];
  const matchingRules = rules.filter(
    rule =>
      rule.verbs?.some(v => v === verb || v === '*') &&
      rule.apiGroups?.some(g => g === apiGroup || g === '*') &&
      rule.resources?.some(r => r === resource || r === '*')
  );

  if (matchingRules.length === 0) {
    return null;
  }

  const names = new Set<string>();
  for (const rule of matchingRules) {
    if (!rule.resourceNames || rule.resourceNames.length === 0) {
      // No resourceNames means this matching rule grants unrestricted access.
      // Note: unlike API groups/resources/verbs, resourceNames has no wildcard support in
      // Kubernetes RBAC (see ResourceNameMatches) — a rule scoped to the literal name "*"
      // authorizes only a node actually named "*", not all nodes. So "*" here must be
      // treated as a real (if unusual) name, not folded into the unrestricted case.
      return null;
    }
    rule.resourceNames.forEach(name => names.add(name));
  }

  return Array.from(names);
}

/**
 * Looks up whether the current user's RBAC rules restrict a cluster-scoped resource/verb
 * to a specific set of resourceNames, via SelfSubjectRulesReview.
 *
 * Note: this always issues a fresh SelfSubjectRulesReview request. Callers that can reuse
 * an already-fetched review (e.g. the one AuthRoute performs via testAuth) should call
 * {@link extractResourceNamesRestriction} directly instead, to avoid a redundant request.
 *
 * @param cluster - Cluster to check.
 * @param apiGroup - API group of the resource (empty string for the core group).
 * @param resource - Plural resource name (e.g. "nodes").
 * @param verb - Verb to check (e.g. "list").
 * @returns Same as {@link extractResourceNamesRestriction}, or `null` if the review
 *  request itself fails.
 */
export async function fetchResourceNamesRestriction(
  cluster: string,
  apiGroup: string,
  resource: string,
  verb: string
): Promise<string[] | null> {
  let review: SelfSubjectRulesReviewResponse;
  try {
    review = await post(
      '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
      { spec: { namespace: 'default' } },
      false,
      { timeout: 5 * 1000, cluster: cluster || getCluster() }
    );
  } catch {
    // If the rules review itself fails (e.g. unsupported by the API server, or the
    // request errors out), don't block the normal list request on it.
    return null;
  }

  return extractResourceNamesRestriction(review, apiGroup, resource, verb);
}

/**
 * React hook version of {@link fetchResourceNamesRestriction}, cached per
 * cluster/apiGroup/resource/verb via react-query so it isn't re-fetched on every render.
 *
 * @param cluster - Cluster to check (falls back to the currently selected cluster).
 * @param apiGroup - API group of the resource (empty string for the core group).
 * @param resource - Plural resource name (e.g. "nodes").
 * @param verb - Verb to check (e.g. "list").
 */
export function useResourceNamesRestriction(
  cluster: string | undefined,
  apiGroup: string,
  resource: string,
  verb: string
): { restrictedNames: string[] | null; isLoading: boolean } {
  const clusterName = cluster || getCluster() || '';

  const { data, isLoading } = useQuery({
    queryKey: ['resourceNamesRestriction', clusterName, apiGroup, resource, verb],
    queryFn: () => fetchResourceNamesRestriction(clusterName, apiGroup, resource, verb),
    // RBAC rules essentially never change mid-session; avoid re-checking on every render/focus.
    staleTime: 5 * 60 * 1000,
    enabled: !!clusterName,
  });

  return { restrictedNames: data ?? null, isLoading: !!clusterName && isLoading };
}

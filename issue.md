---
name: Feature request
about: Suggest an idea for this project
title: '[Advanced] Caching and Adaptive Endpoints Selection in repeatStreamFunc'
labels: kind/feature
assignees: ''
---

## Is your feature request related to a problem? Please describe the impact that the lack of the feature requested is creating.
When Headlamp queries or streams Kubernetes resources, it uses `repeatStreamFunc` to iterate over a list of fallback API endpoints (e.g. custom resource v1 vs v1beta1 vs v1alpha1). Currently, this process is completely stateless. Every time the component mounts, refreshes, or streams a resource, it starts checking from endpointIndex = 0 again. This results in redundant 404 requests sent to the Kubernetes API server, causing performance overhead.

## Describe the solution you'd like
Introduce a client-side memory cache (structured by cluster context and resource type) that tracks:
1. Which API endpoints returned 404 (endpoint caching).
2. The index of the last successful endpoint so we can prioritize it in subsequent requests (adaptive optimization) instead of iterating from index 0.

Invalidate/clear the cache when:
- The cluster context changes.
- CRDs are modified (creation, update, deletion) or reloaded.

## What users will benefit from this feature?
All Headlamp users, particularly those with clusters containing many custom resources or using dynamic custom resources, as this reduces redundant API calls to the Kubernetes API server.

## Are you able to implement this feature?
Yes (I will propose a PR).

## Additional context
Unit tests should be added to verify caching, adaptive selection, and invalidation on context switch or CRD updates/stream events.

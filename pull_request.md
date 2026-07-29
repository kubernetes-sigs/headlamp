## Summary

This PR adds client-side memory caching and adaptive endpoint selection in `repeatStreamFunc` to eliminate redundant 404 requests to the Kubernetes API server when resolving fallback endpoints for Kubernetes resources.

## Related Issue

Fixes #6751

## Changes

- Added client-side memory cache structured by cluster context and resource type in `streamingApi.ts`.
- Updated `repeatStreamFunc` in `factories.ts` to prioritize the cached preferred successful endpoint index and skip known failed endpoints.
- Optimised fallback logic to immediately return 404 for `get` requests on preferred endpoints if the instance (not the endpoint) is not found, avoiding unnecessary fallback iterations.
- Integrated automatic cache invalidation on cluster context change in `factories.ts`.
- Integrated automatic cache invalidation on CRD modification or reload (via write operations in `repeatFactoryMethod` and real-time stream messages in `connectStreamWithParams`).
- Created comprehensive unit tests in `apiProxy.test.ts` to verify caching, adaptive selection, and cache invalidation.

## Steps to Test

1. Run the Vitest unit tests specifically for the API proxy to verify all tests pass:
   ```bash
   cd frontend && npm run test -- run src/lib/k8s/api/v1/apiProxy.test.ts
   ```
2. Verify the entire frontend test suite passes:
   ```bash
   make frontend-test
   ```

## Screenshots (if applicable)

N/A (Backend logic changes covered by unit tests).

## Notes for the Reviewer

- Caching is stored in-memory in the client frontend, meaning it automatically clears on page refresh/reload and has zero persistence overhead.
- Cache invalidation leverages the existing customresourcedefinitions watch stream so that any CRD changes (even made by other users or controllers) are picked up in real-time to invalidate the cached endpoints.

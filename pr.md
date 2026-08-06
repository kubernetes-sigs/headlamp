# feat(backend): implement LRU cache and eviction policies for clientsets

## Summary

- Bound retained authorization clientsets with a configurable LRU capacity.
- Evict the least-recently-used clientset by removing its map and LRU-list entries.
- Preserve the existing TTL and context-cleanup eviction policies.
- Keep warm cache hits off the per-request INFO log path.

Eviction only bounds the number of retained clientsets and removes cache/LRU entries.
It does **not** close idle connections or call `CloseIdleConnections` on client-go
transports. Those transports can be shared by retained clientsets; connection lifetime
and cleanup remain owned by client-go and the transport owner.

## Release notes

The backend cache now bounds retained clientsets with an LRU policy in addition to its
existing TTL policy. Eviction removes map/LRU entries only and does not close shared
client-go transports. Connection lifetime and cleanup remain owned by client-go and the
transport owner.

## Testing

1. Run `go test ./pkg/k8cache` from `backend/`.
2. Run the k8cache package lint checks.
3. Verify LRU capacity eviction removes the expected map/LRU entry and preserves
   recently used clientsets.
4. Run `TestLRUEviction_DoesNotCloseSharedTransport` to verify eviction does not close
   the transport while a retained clientset still uses it and that the retained clientset
   remains usable.

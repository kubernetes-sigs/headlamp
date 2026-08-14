# Interface: SessionPersistence

Defined in: [lib/k8s/backendTrafficPolicy.ts:67](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L67)

SessionPersistence keeps successive requests from the same client on a
consistent backend.  The exact shape is still evolving in the spec, so this
is typed loosely for now.

## Indexable

```ts
[key: string]: any
```

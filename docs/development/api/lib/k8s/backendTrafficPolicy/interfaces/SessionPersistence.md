# Interface: SessionPersistence

Defined in: [lib/k8s/backendTrafficPolicy.ts:67](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/backendTrafficPolicy.ts#L67)

SessionPersistence keeps successive requests from the same client on a
consistent backend.  The exact shape is still evolving in the spec, so this
is typed loosely for now.

## Indexable

```ts
[key: string]: any
```

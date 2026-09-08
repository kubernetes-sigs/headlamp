# Interface: SessionPersistence

Defined in: [lib/k8s/backendTrafficPolicy.ts:67](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/backendTrafficPolicy.ts#L67)

SessionPersistence keeps successive requests from the same client on a
consistent backend.  The exact shape is still evolving in the spec, so this
is typed loosely for now.

## Indexable

```ts
[key: string]: any
```

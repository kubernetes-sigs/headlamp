# Interface: SessionPersistence

Defined in: [lib/k8s/backendTrafficPolicy.ts:67](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L67)

SessionPersistence keeps successive requests from the same client on a
consistent backend.  The exact shape is still evolving in the spec, so this
is typed loosely for now.

## Indexable

```ts
[key: string]: any
```

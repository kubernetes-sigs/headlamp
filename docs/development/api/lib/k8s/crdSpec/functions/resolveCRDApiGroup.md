# Function: resolveCRDApiGroup()

```ts
function resolveCRDApiGroup(crd: 
  | CRDApiGroupSource
  | null
  | undefined): [string, string, string] | null;
```

Defined in: [lib/k8s/crdSpec.ts:226](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L226)

Resolves `[group, version, plural]` from either the new or the legacy
surface on a CRD instance, returning `null` when neither yields a usable
identity. Plugin bundles ship their own copy of this module's code, so a
plugin built before `getMainAPIGroupOrNull()` existed will not have the
method on its CRD instance at runtime. We duck-type the call rather than
assume the new API is present, and we route both surfaces through the
same tuple validator so an all-empty sentinel or a missing version
component is treated as "no usable identity" on either path.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `crd` | \| [`CRDApiGroupSource`](../interfaces/CRDApiGroupSource.md) \| `null` \| `undefined` |

## Returns

\[`string`, `string`, `string`\] \| `null`

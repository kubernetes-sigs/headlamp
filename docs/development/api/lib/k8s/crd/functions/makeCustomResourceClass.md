# ~~Function: makeCustomResourceClass()~~

## Call Signature

```ts
function makeCustomResourceClass(args: [string, string, string][], isNamespaced: boolean): typeof KubeObject;
```

Defined in: [lib/k8s/crd.ts:219](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crd.ts#L219)

### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | \[`string`, `string`, `string`\][] |
| `isNamespaced` | `boolean` |

### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

### Deprecated

Use the version of the function that receives an object as its argument.

## Call Signature

```ts
function makeCustomResourceClass(args: CRClassArgs): typeof KubeObject;
```

Defined in: [lib/k8s/crd.ts:223](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crd.ts#L223)

### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`CRClassArgs`](../interfaces/CRClassArgs.md) |

### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

### Deprecated

Use the version of the function that receives an object as its argument.

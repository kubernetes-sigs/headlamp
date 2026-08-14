# ~~Function: makeCustomResourceClass()~~

## Call Signature

```ts
function makeCustomResourceClass(args: [string, string, string][], isNamespaced: boolean): typeof KubeObject;
```

Defined in: [lib/k8s/crd.ts:153](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/crd.ts#L153)

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

Defined in: [lib/k8s/crd.ts:157](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/crd.ts#L157)

### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`CRClassArgs`](../interfaces/CRClassArgs.md) |

### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

### Deprecated

Use the version of the function that receives an object as its argument.

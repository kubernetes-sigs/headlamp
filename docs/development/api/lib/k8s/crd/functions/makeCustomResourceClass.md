# ~~Function: makeCustomResourceClass()~~

## Call Signature

```ts
function makeCustomResourceClass(args: [string, string, string][], isNamespaced: boolean): typeof KubeObject;
```

Defined in: [lib/k8s/crd.ts:153](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/crd.ts#L153)

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

Defined in: [lib/k8s/crd.ts:157](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/crd.ts#L157)

### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`CRClassArgs`](../interfaces/CRClassArgs.md) |

### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

### Deprecated

Use the version of the function that receives an object as its argument.

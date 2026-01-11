# Function: makeCustomResourceClass()

## makeCustomResourceClass(args, isNamespaced)

```ts
function makeCustomResourceClass(args: [string, string, string][], isNamespaced: boolean): KubeObjectClass
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`string`, `string`, `string`][] |
| `isNamespaced` | `boolean` |

### Returns

[`KubeObjectClass`](../../KubeObject/type-aliases/KubeObjectClass.md)

### Deprecated

Use the version of the function that receives an object as its argument.

### Defined in

[src/lib/k8s/crd.ts:153](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/crd.ts#L153)

## makeCustomResourceClass(args)

```ts
function makeCustomResourceClass(args: CRClassArgs): KubeObjectClass
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`CRClassArgs`](../interfaces/CRClassArgs.md) |

### Returns

[`KubeObjectClass`](../../KubeObject/type-aliases/KubeObjectClass.md)

### Defined in

[src/lib/k8s/crd.ts:157](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/crd.ts#L157)

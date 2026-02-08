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

[src/lib/k8s/crd.ts:153](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/crd.ts#L153)

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

[src/lib/k8s/crd.ts:157](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/crd.ts#L157)

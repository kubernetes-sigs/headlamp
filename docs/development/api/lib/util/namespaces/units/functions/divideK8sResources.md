# Function: divideK8sResources()

```ts
function divideK8sResources(
   a: string, 
   b: string, 
   resourceType?: "cpu" | "memory"): number;
```

Defined in: [lib/units.ts:113](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/units.ts#L113)

Divides two Kubernetes resource quantities.
Useful for computing resource field references with divisors.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `a` | `string` | `undefined` | The dividend resource string (e.g., "1Gi", "500m") |
| `b` | `string` | `undefined` | The divisor resource string (e.g., "1Mi", "1") |
| `resourceType` | `"cpu"` \| `"memory"` | `'memory'` | The type of resource ('cpu' or 'memory'). Defaults to 'memory'. |

## Returns

`number`

The result of dividing a by b

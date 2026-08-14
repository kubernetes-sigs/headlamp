# Function: divideK8sResources()

```ts
function divideK8sResources(
   a: string, 
   b: string, 
   resourceType?: "cpu" | "memory"): number;
```

Defined in: [lib/units.ts:107](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/units.ts#L107)

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

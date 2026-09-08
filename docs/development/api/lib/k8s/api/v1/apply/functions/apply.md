# Function: apply()

```ts
function apply<T>(
   body: T, 
   clusterName?: string, 
options?: ApplyOptions): Promise<T>;
```

Defined in: [lib/k8s/api/v1/apply.ts:43](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/apply.ts#L43)

Applies the provided body to the Kubernetes API.

Tries to POST, and if there's a conflict it does a PUT to the api endpoint.

Overloads:
- When called with a KubeObjectInterfaceCreate body, the parameter type is the create type.
- Otherwise it accepts a full KubeObjectInterface.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterfaceCreate`](../../../../KubeObject/interfaces/KubeObjectInterfaceCreate.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `body` | `T` | The kubernetes object body to apply. |
| `clusterName?` | `string` | The cluster to apply the body to. By default uses the current cluster (URL defined). |
| `options?` | [`ApplyOptions`](../interfaces/ApplyOptions.md) | - |

## Returns

`Promise`\<`T`\>

The response from the kubernetes API server.

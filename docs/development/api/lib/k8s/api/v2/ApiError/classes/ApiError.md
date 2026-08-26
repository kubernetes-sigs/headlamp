# Class: ApiError

Defined in: [lib/k8s/api/v2/ApiError.tsx:21](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/ApiError.tsx#L21)

Error with additional information about the request that casued it
Used for backend response error handling

## Extends

- `Error`

## Constructors

### Constructor

```ts
new ApiError(message: string, props?: object): ApiError;
```

Defined in: [lib/k8s/api/v2/ApiError.tsx:29](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/ApiError.tsx#L29)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `props?` | \{ `cluster?`: `string`; `namespace?`: `string`; `status?`: `number`; \} |
| `props.cluster?` | `string` |
| `props.namespace?` | `string` |
| `props.status?` | `number` |

#### Returns

`ApiError`

#### Overrides

```ts
Error.constructor
```

## Properties

| Property | Modifier | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="property-cluster"></a> `cluster?` | `public` | `string` | Cluster name | - | [lib/k8s/api/v2/ApiError.tsx:27](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/ApiError.tsx#L27) |
| <a id="property-message"></a> `message` | `public` | `string` | - | `Error.message` | [lib/k8s/api/v2/ApiError.tsx:30](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/ApiError.tsx#L30) |
| <a id="property-namespace"></a> `namespace?` | `public` | `string` | Namespace of the requested resource | - | [lib/k8s/api/v2/ApiError.tsx:25](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/ApiError.tsx#L25) |
| <a id="property-status"></a> `status?` | `public` | `number` | HTTP status code of the error | - | [lib/k8s/api/v2/ApiError.tsx:23](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/ApiError.tsx#L23) |

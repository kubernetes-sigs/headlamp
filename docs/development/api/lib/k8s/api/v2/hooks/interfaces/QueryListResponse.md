# Interface: QueryListResponse\<DataType, ItemType, ErrorType\>

Query response containing KubeList with added items field for convenience

## Extends

- [`QueryResponse`](QueryResponse.md)\<`DataType`, `ErrorType`\>

## Type Parameters

| Type Parameter |
| ------ |
| `DataType` |
| `ItemType` |
| `ErrorType` |

## Properties

### clusterResults?

```ts
optional clusterResults: Record<string, QueryListResponse<DataType, ItemType, ErrorType>>;
```

Results from individual clusters. Keyed by cluster name.

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:80](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L80)

***

### data

```ts
data: null | DataType;
```

The last successfully resolved data for the query.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`data`](QueryResponse.md#data)

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L37)

***

### error

```ts
error: null | ErrorType;
```

The error object for the query, if an error was thrown.
- Defaults to `null`.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`error`](QueryResponse.md#error)

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L42)

***

### errors

```ts
errors: null | ApiError[];
```

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:81](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L81)

***

### isError

```ts
isError: boolean;
```

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query attempt resulted in an error.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isError`](QueryResponse.md#iserror)

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:47](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L47)

***

### isFetching

```ts
isFetching: boolean;
```

Is `true` whenever the query is executing, which includes initial fetch as well as background refetch.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isFetching`](QueryResponse.md#isfetching)

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:55](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L55)

***

### isLoading

```ts
isLoading: boolean;
```

Is `true` whenever the first fetch for a query is in-flight.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isLoading`](QueryResponse.md#isloading)

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:51](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L51)

***

### isSuccess

```ts
isSuccess: boolean;
```

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query has received a response with no errors and is ready to display its data.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isSuccess`](QueryResponse.md#issuccess)

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:60](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L60)

***

### items

```ts
items: null | ItemType[];
```

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:76](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L76)

***

### status

```ts
status: QueryStatus;
```

The status of the query.
- Will be:
  - `pending` if there's no cached data and no query attempt was finished yet.
  - `error` if the query attempt resulted in an error.
  - `success` if the query has received a response with no errors and is ready to display its data.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`status`](QueryResponse.md#status)

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:68](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L68)

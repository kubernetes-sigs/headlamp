# Interface: QueryListResponse\<DataType, ItemType, ErrorType\>

Defined in: [lib/k8s/api/v2/hooks.ts:75](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L75)

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
optional clusterResults?: Record<string, QueryListResponse<DataType, ItemType, ErrorType>>;
```

Defined in: [lib/k8s/api/v2/hooks.ts:81](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L81)

Results from individual clusters. Keyed by cluster name.

***

### data

```ts
data: DataType | null;
```

Defined in: [lib/k8s/api/v2/hooks.ts:38](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L38)

The last successfully resolved data for the query.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`data`](QueryResponse.md#data)

***

### error

```ts
error: ErrorType | null;
```

Defined in: [lib/k8s/api/v2/hooks.ts:43](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L43)

The error object for the query, if an error was thrown.
- Defaults to `null`.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`error`](QueryResponse.md#error)

***

### errors

```ts
errors: ApiError[] | null;
```

Defined in: [lib/k8s/api/v2/hooks.ts:82](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L82)

***

### isError

```ts
isError: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:48](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L48)

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query attempt resulted in an error.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isError`](QueryResponse.md#iserror)

***

### isFetching

```ts
isFetching: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:56](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L56)

Is `true` whenever the query is executing, which includes initial fetch as well as background refetch.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isFetching`](QueryResponse.md#isfetching)

***

### isLoading

```ts
isLoading: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:52](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L52)

Is `true` whenever the first fetch for a query is in-flight.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isLoading`](QueryResponse.md#isloading)

***

### isSuccess

```ts
isSuccess: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:61](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L61)

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query has received a response with no errors and is ready to display its data.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`isSuccess`](QueryResponse.md#issuccess)

***

### items

```ts
items: ItemType[] | null;
```

Defined in: [lib/k8s/api/v2/hooks.ts:77](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L77)

***

### status

```ts
status: QueryStatus;
```

Defined in: [lib/k8s/api/v2/hooks.ts:69](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L69)

The status of the query.
- Will be:
  - `pending` if there's no cached data and no query attempt was finished yet.
  - `error` if the query attempt resulted in an error.
  - `success` if the query has received a response with no errors and is ready to display its data.

#### Inherited from

[`QueryResponse`](QueryResponse.md).[`status`](QueryResponse.md#status)

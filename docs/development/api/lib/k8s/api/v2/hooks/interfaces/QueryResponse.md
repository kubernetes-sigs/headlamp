# Interface: QueryResponse\<DataType, ErrorType\>

## Extended by

- [`QueryListResponse`](QueryListResponse.md)

## Type Parameters

| Type Parameter |
| ------ |
| `DataType` |
| `ErrorType` |

## Properties

### data

```ts
data: null | DataType;
```

The last successfully resolved data for the query.

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L37)

***

### error

```ts
error: null | ErrorType;
```

The error object for the query, if an error was thrown.
- Defaults to `null`.

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L42)

***

### isError

```ts
isError: boolean;
```

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query attempt resulted in an error.

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:47](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L47)

***

### isFetching

```ts
isFetching: boolean;
```

Is `true` whenever the query is executing, which includes initial fetch as well as background refetch.

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:55](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L55)

***

### isLoading

```ts
isLoading: boolean;
```

Is `true` whenever the first fetch for a query is in-flight.

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:51](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L51)

***

### isSuccess

```ts
isSuccess: boolean;
```

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query has received a response with no errors and is ready to display its data.

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:60](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L60)

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

#### Defined in

[src/lib/k8s/api/v2/hooks.ts:68](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L68)

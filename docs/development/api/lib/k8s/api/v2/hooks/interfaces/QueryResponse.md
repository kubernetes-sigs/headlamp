# Interface: QueryResponse\<DataType, ErrorType\>

Defined in: [lib/k8s/api/v2/hooks.ts:34](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L34)

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
data: DataType | null;
```

Defined in: [lib/k8s/api/v2/hooks.ts:38](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L38)

The last successfully resolved data for the query.

***

### error

```ts
error: ErrorType | null;
```

Defined in: [lib/k8s/api/v2/hooks.ts:43](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L43)

The error object for the query, if an error was thrown.
- Defaults to `null`.

***

### isError

```ts
isError: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:48](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L48)

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query attempt resulted in an error.

***

### isFetching

```ts
isFetching: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:56](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L56)

Is `true` whenever the query is executing, which includes initial fetch as well as background refetch.

***

### isLoading

```ts
isLoading: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:52](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L52)

Is `true` whenever the first fetch for a query is in-flight.

***

### isSuccess

```ts
isSuccess: boolean;
```

Defined in: [lib/k8s/api/v2/hooks.ts:61](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/hooks.ts#L61)

A derived boolean from the `status` variable, provided for convenience.
- `true` if the query has received a response with no errors and is ready to display its data.

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

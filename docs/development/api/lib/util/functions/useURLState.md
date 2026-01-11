# Function: useURLState()

A hook to manage a state variable that is also stored in the URL.

## Param

The name of the key in the URL. If empty, then the hook behaves like useState.

## Param

The default value of the state variable, or the params object.

## useURLState(key, defaultValue)

```ts
function useURLState(key: string, defaultValue: number): [number, React.Dispatch<React.SetStateAction<number>>]
```

A hook to manage a state variable that is also stored in the URL.

### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `defaultValue` | `number` |

### Returns

[`number`, `React.Dispatch`\<`React.SetStateAction`\<`number`\>\>]

### Param

The name of the key in the URL. If empty, then the hook behaves like useState.

### Param

The default value of the state variable, or the params object.

### Defined in

[src/lib/util.ts:258](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/util.ts#L258)

## useURLState(key, valueOrParams)

```ts
function useURLState(key: string, valueOrParams: number | URLStateParams<number>): [number, React.Dispatch<React.SetStateAction<number>>]
```

A hook to manage a state variable that is also stored in the URL.

### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `valueOrParams` | `number` \| `URLStateParams`\<`number`\> |

### Returns

[`number`, `React.Dispatch`\<`React.SetStateAction`\<`number`\>\>]

### Param

The name of the key in the URL. If empty, then the hook behaves like useState.

### Param

The default value of the state variable, or the params object.

### Defined in

[src/lib/util.ts:262](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/util.ts#L262)

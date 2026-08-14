# Function: useURLState()

A hook to manage a state variable that is also stored in the URL.

## Param

The name of the key in the URL. If empty, then the hook behaves like useState.

## Param

The default value of the state variable, or the params object.

## Call Signature

```ts
function useURLState(key: string, defaultValue: number): [number, Dispatch<SetStateAction<number>>];
```

Defined in: [lib/util.ts:396](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/util.ts#L396)

### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `defaultValue` | `number` |

### Returns

\[`number`, `Dispatch`\<`SetStateAction`\<`number`\>\>\]

## Call Signature

```ts
function useURLState(key: string, valueOrParams: number | URLStateParams<number>): [number, Dispatch<SetStateAction<number>>];
```

Defined in: [lib/util.ts:400](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/util.ts#L400)

### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `valueOrParams` | `number` \| `URLStateParams`\<`number`\> |

### Returns

\[`number`, `Dispatch`\<`SetStateAction`\<`number`\>\>\]

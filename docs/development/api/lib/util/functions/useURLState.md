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

Defined in: [lib/util.ts:396](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L396)

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

Defined in: [lib/util.ts:400](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L400)

### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `valueOrParams` | `number` \| `URLStateParams`\<`number`\> |

### Returns

\[`number`, `Dispatch`\<`SetStateAction`\<`number`\>\>\]

# Variable: Activity

```ts
Activity: object;
```

## Type declaration

### close()

Closes activity

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

`void`

### launch()

Launches new Activity

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `activity` | [`Activity`](../interfaces/Activity.md) |

#### Returns

`void`

### reset()

#### Returns

`void`

### update()

Update existing activity with a partial changes

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `diff` | `Partial`\<[`Activity`](../interfaces/Activity.md)\> |

#### Returns

`void`

## Defined in

[src/components/activity/Activity.tsx:53](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L53)

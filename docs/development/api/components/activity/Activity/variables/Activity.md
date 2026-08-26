# Variable: Activity

```ts
Activity: object;
```

Defined in: [components/activity/Activity.tsx:69](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L69)

## Type Declaration

### close()

```ts
close(id: string): void;
```

Closes activity

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

`void`

### launch()

```ts
launch(activity: Activity): void;
```

Launches new Activity

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `activity` | [`Activity`](../interfaces/Activity.md) |

#### Returns

`void`

### reset()

```ts
reset(): void;
```

#### Returns

`void`

### update()

```ts
update(id: string, diff: Partial<Activity>): void;
```

Update existing activity with a partial changes

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `diff` | `Partial`\<[`Activity`](../interfaces/Activity.md)\> |

#### Returns

`void`

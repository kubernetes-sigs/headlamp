# Function: useActivity()

```ts
function useActivity(): readonly [Activity, (changes: Partial<Activity>) => void]
```

Control activity from within, requires to be used within an existing Activity

## Returns

readonly [[`Activity`](../interfaces/Activity.md), (`changes`: `Partial`\<[`Activity`](../interfaces/Activity.md)\>) => `void`]

## Defined in

[src/components/activity/Activity.tsx:99](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L99)

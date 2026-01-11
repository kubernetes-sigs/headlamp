# Interface: OverviewChartsProcessor

## Properties

### id?

```ts
optional id: string;
```

#### Defined in

[src/redux/overviewChartsSlice.ts:26](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/overviewChartsSlice.ts#L26)

***

### processor()

```ts
processor: (charts: OverviewChart[]) => OverviewChart[];
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `charts` | `OverviewChart`[] |

#### Returns

`OverviewChart`[]

#### Defined in

[src/redux/overviewChartsSlice.ts:27](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/overviewChartsSlice.ts#L27)

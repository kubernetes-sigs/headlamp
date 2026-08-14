# Interface: OverviewChartsProcessor

Defined in: [redux/overviewChartsSlice.ts:25](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/overviewChartsSlice.ts#L25)

## Properties

### id?

```ts
optional id?: string;
```

Defined in: [redux/overviewChartsSlice.ts:26](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/overviewChartsSlice.ts#L26)

***

### processor

```ts
processor: (charts: OverviewChart[]) => OverviewChart[];
```

Defined in: [redux/overviewChartsSlice.ts:27](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/overviewChartsSlice.ts#L27)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `charts` | `OverviewChart`[] |

#### Returns

`OverviewChart`[]

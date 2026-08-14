# Interface: OverviewChartsProcessor

Defined in: [redux/overviewChartsSlice.ts:25](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/overviewChartsSlice.ts#L25)

## Properties

### id?

```ts
optional id?: string;
```

Defined in: [redux/overviewChartsSlice.ts:26](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/overviewChartsSlice.ts#L26)

***

### processor

```ts
processor: (charts: OverviewChart[]) => OverviewChart[];
```

Defined in: [redux/overviewChartsSlice.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/overviewChartsSlice.ts#L27)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `charts` | `OverviewChart`[] |

#### Returns

`OverviewChart`[]

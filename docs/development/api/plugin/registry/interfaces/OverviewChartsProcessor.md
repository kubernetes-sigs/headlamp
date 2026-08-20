# Interface: OverviewChartsProcessor

Defined in: [redux/overviewChartsSlice.ts:25](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/overviewChartsSlice.ts#L25)

## Properties

### id?

```ts
optional id?: string;
```

Defined in: [redux/overviewChartsSlice.ts:26](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/overviewChartsSlice.ts#L26)

***

### processor

```ts
processor: (charts: OverviewChart[]) => OverviewChart[];
```

Defined in: [redux/overviewChartsSlice.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/overviewChartsSlice.ts#L27)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `charts` | `OverviewChart`[] |

#### Returns

`OverviewChart`[]

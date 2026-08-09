# Interface: OverviewChartsProcessor

Defined in: [redux/overviewChartsSlice.ts:25](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/overviewChartsSlice.ts#L25)

## Properties

### id?

```ts
optional id?: string;
```

Defined in: [redux/overviewChartsSlice.ts:26](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/overviewChartsSlice.ts#L26)

***

### processor

```ts
processor: (charts: OverviewChart[]) => OverviewChart[];
```

Defined in: [redux/overviewChartsSlice.ts:27](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/overviewChartsSlice.ts#L27)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `charts` | `OverviewChart`[] |

#### Returns

`OverviewChart`[]

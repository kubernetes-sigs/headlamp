# Interface: OverviewChartsProcessor

## Properties

### id?

```ts
optional id: string;
```

#### Defined in

[src/redux/overviewChartsSlice.ts:26](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/overviewChartsSlice.ts#L26)

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

[src/redux/overviewChartsSlice.ts:27](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/overviewChartsSlice.ts#L27)

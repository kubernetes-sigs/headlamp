import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { MRT_ColumnFiltersState } from 'material-react-table';

interface TableFiltersStoreState {
  filtersByTableId: {
    [tableId: string]: MRT_ColumnFiltersState;
  };
}

const initialState: TableFiltersStoreState = {
  filtersByTableId: {},
};

const tableFiltersSlice = createSlice({
  name: 'tableFilters',
  initialState,
  reducers: {
    setTableFiltersAction(
      state,
      action: PayloadAction<{ tableId: string; filters: MRT_ColumnFiltersState }>
    ) {
      const { tableId, filters } = action.payload;
      state.filtersByTableId[tableId] = filters;
      try {
        localStorage.setItem(`table_filters.${tableId}`, JSON.stringify(filters));
      } catch (error) {
        console.error(`Error saving filters to localStorage for table ${tableId}:`, error);
      }
    },
    loadTableFiltersAction(state, action: PayloadAction<{ tableId: string }>) {
      const { tableId } = action.payload;
      try {
        const storedFilters = localStorage.getItem(`table_filters.${tableId}`);
        if (storedFilters) {
          const parsedFilters = JSON.parse(storedFilters);
          if (Array.isArray(parsedFilters)) {
            state.filtersByTableId[tableId] = parsedFilters;
          } else {
            console.warn(
              `Filters for table ${tableId} in localStorage was not an array:`,
              parsedFilters
            );
            // Optionally, clear the invalid item from localStorage
            // localStorage.removeItem(`table_filters.${tableId}`);
          }
        }
      } catch (error) {
        console.error(`Error loading filters from localStorage for table ${tableId}:`, error);
      }
    },
  },
});

export const { setTableFiltersAction, loadTableFiltersAction } = tableFiltersSlice.actions;
export default tableFiltersSlice.reducer;

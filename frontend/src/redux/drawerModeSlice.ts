import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DrawerModeState {
  isDetailDrawerEnabled: boolean;
  selectedResource?: {
    kind: string;
    metadata: { name: string; namespace?: string };
    /**
     * If the selected resource is a custom resource you should provide
     * the name of the custom resource definition
     */
    customResourceDefinition?: string;
    cluster: string;
  };
}

const getLocalDrawerStatus = (key: string) => localStorage.getItem(key) === 'true';

const localStorageName = 'detailDrawerEnabled';

const initialState: DrawerModeState = {
  isDetailDrawerEnabled: getLocalDrawerStatus(localStorageName),
  selectedResource: undefined,
};

const drawerModeSlice = createSlice({
  name: 'drawerMode',
  initialState,
  reducers: {
    setDetailDrawerEnabled: (state, action: PayloadAction<boolean>) => {
      state.isDetailDrawerEnabled = action.payload;
      localStorage.setItem(localStorageName, `${action.payload}`);
    },
    setSelectedResource: (state, action: PayloadAction<DrawerModeState['selectedResource']>) => {
      state.selectedResource = action.payload;
    },
  },
});

export const { setDetailDrawerEnabled, setSelectedResource } = drawerModeSlice.actions;
export default drawerModeSlice.reducer;

import { IconProps } from '@iconify/react';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export enum DefaultSidebars {
  HOME = 'HOME',
  IN_CLUSTER = 'IN-CLUSTER',
}

/**
 * Represents an entry in the sidebar menu.
 */
export interface SidebarEntry {
  /**
   * Name of this SidebarItem.
   */
  name: string;
  /**
   * Text to display under the name.
   */
  subtitle?: string;
  /**
   * Label to display.
   */
  label: string;
  /**
   * Name of the parent SidebarEntry.
   */
  parent?: string | null;
  /**
   * URL to go to when this item is followed.
   */
  url?: string;
  /**
   * Should URL have the cluster prefix? (default=true)
   */
  useClusterURL?: boolean;
  /**
   * An iconify string or icon object that will be used for the sidebar's icon
   *
   * @see https://icon-sets.iconify.design/mdi/ for icons.
   */
  icon?: IconProps['icon'];
  /** The sidebar to display this item in. If not specified, it will be displayed in the default sidebar.
   */
  sidebar?: DefaultSidebars | string;
}

export interface SidebarState {
  /**
   * The currently selected item in the sidebar.
   */
  selected: {
    item: string | null;
    sidebar: string | DefaultSidebars | null;
  };
  /**
   * Is the sidebar visible?
   */
  isVisible: boolean;
  /**
   * Is the sidebar open?
   */
  isSidebarOpen?: boolean;
  /**
   * Was there user interaction to set the sidebar open?
   */
  isSidebarOpenUserSelected?: boolean;
  /**
   * The entries in the sidebar.
   */
  entries: { [propName: string]: SidebarEntry };
  /**
   * Filters to apply to the sidebar entries.
   */
  filters: ((entry: SidebarEntry) => SidebarEntry | null)[];
}

export function setInitialSidebarOpen() {
  let defaultOpen;

  const openUserSelected = localStorage?.getItem('sidebar')
    ? !JSON.parse(localStorage.getItem('sidebar')!).shrink
    : undefined;

  if (openUserSelected !== undefined) {
    defaultOpen = openUserSelected;
  } else {
    defaultOpen = window?.innerWidth ? window.innerWidth > 960 : true;
  }

  return {
    isSidebarOpen: defaultOpen,
    isSidebarOpenUserSelected: undefined,
  };
}

export const initialState: SidebarState = {
  selected: {
    item: null,
    sidebar: null,
  },
  isVisible: false,
  ...setInitialSidebarOpen(),
  entries: {},
  filters: [],
};

const sidebarSlice = createSlice({
  name: 'sidebar',
  initialState,
  reducers: {
    /**
     * Sets the selected item in the sidebar.
     */
    setSidebarSelected(
      state,
      action: PayloadAction<{ item: string | null; sidebar: string | DefaultSidebars | null }>
    ) {
      state.selected = action.payload;
      state.isVisible = !!action.payload.item;
    },

    /**
     * Sets the visibility of the sidebar.
     */
    setSidebarVisible(state, action: PayloadAction<boolean>) {
      state.isVisible = action.payload;
    },

    /**
     * Sets an item in the sidebar.
     */
    setSidebarItem(state, action: PayloadAction<SidebarEntry>) {
      state.entries[action.payload.name] = action.payload;
    },

    /**
     * Sets a filter for sidebar items.
     */
    setSidebarItemFilter(
      state,
      action: PayloadAction<(entry: SidebarEntry) => SidebarEntry | null>
    ) {
      state.filters.push(action.payload);
    },

    /**
     * Sets whether the sidebar is open or not.
     */
    setWhetherSidebarOpen(state, action: PayloadAction<boolean>) {
      localStorage.setItem('sidebar', JSON.stringify({ shrink: !action.payload }));
      state.isSidebarOpen = action.payload;
      state.isSidebarOpenUserSelected = action.payload;
    },
  },
});

export const {
  setSidebarSelected,
  setSidebarVisible,
  setSidebarItem,
  setSidebarItemFilter,
  setWhetherSidebarOpen,
} = sidebarSlice.actions;

export { sidebarSlice };

export default sidebarSlice.reducer;

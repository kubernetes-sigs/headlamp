import { createSlice , PayloadAction } from "@reduxjs/toolkit";

interface PageState {
    currentPage: number;
}

const initialState: PageState = {
    currentPage: 1
}

const pageSlice = createSlice({
  name: 'page',
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.currentPage = action.payload;
    //   console.log("page now: ", state.currentPage)
    },
    incrementPage(state) {
    // console.log("incremental pages: ", state.currentPage)
      state.currentPage += 1;
    },
  },
});

export const  {setPage, incrementPage} = pageSlice.actions

export default pageSlice.reducer;
/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Activity } from './Activity';

export interface ActivityState {
  /** History of opened activities, list of IDs */
  history: string[];
  /** Map of all open activities, key is the ID */
  activities: Record<string, Activity>;
}

const initialState: ActivityState = {
  history: [],
  activities: {},
};

export const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {
    launchActivity(state, action: PayloadAction<Activity>) {
      // Add to history
      if (!action.payload.minimized) {
        state.history = state.history.filter(it => it !== action.payload.id);
        state.history.push(action.payload.id);
      }

      // Close other temporary tabs
      Object.values(state.activities).forEach(activity => {
        if (activity.temporary) {
          delete state.activities[activity.id];
          state.history = state.history.filter(it => it !== activity.id);
        }
      });

      if (!state.activities[action.payload.id]) {
        // New activity, add it to the state
        state.activities[action.payload.id] = action.payload;
      } else {
        // Existing activity, un-minimize it
        state.activities[action.payload.id].minimized = false;
      }

      // Make it fullscreen on small windows
      if (window.innerWidth < 1280) {
        state.activities[action.payload.id] = {
          ...state.activities[action.payload.id],
          location: 'full',
        };
      }

      // Dispatch resize event so the content adjusts
      // 200ms delay for animations
      setTimeout(() => {
        window?.dispatchEvent?.(new Event('resize'));
      }, 200);
    },
    close(state, action: PayloadAction<string>) {
      // Remove the activity from history
      state.history = state.history.filter(it => it !== action.payload);
      // Remove from state
      delete state.activities[action.payload];
    },
    update(state, action: PayloadAction<Partial<Activity> & { id: string }>) {
      // Bump this activity in history
      if (!action.payload.minimized) {
        state.history = state.history.filter(it => it !== action.payload.id);
        state.history.push(action.payload.id);
      }

      // Remove from history if it's minimized
      if (action.payload.minimized) {
        state.history = state.history.filter(it => it !== action.payload.id);
      }

      // Update the state
      state.activities[action.payload.id] = {
        ...state.activities[action.payload.id],
        ...action.payload,
      };

      // Dispatch resize event so the content adjusts
      // 200ms delay for animations
      setTimeout(() => {
        window?.dispatchEvent?.(new Event('resize'));
      }, 200);
    },
    reset() {
      return initialState;
    },
  },
});

export const activityReducer = activitySlice.reducer;

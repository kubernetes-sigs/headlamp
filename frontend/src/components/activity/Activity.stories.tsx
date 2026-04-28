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

import { Box } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import store from '../../redux/stores/store';
import { ActivitiesRenderer, Activity } from './Activity';
import { activitySlice } from './activitySlice';

export default {
  title: 'Activity',
  component: ActivitiesRenderer,
  decorators: [
    Story => (
      <Provider store={store}>
        <MemoryRouter>
          <Box
            sx={{
              display: 'grid',
              overflow: 'hidden',
              flexGrow: '1',
              position: 'relative',
              gridTemplateRows: '1fr min-content',
              gridTemplateColumns: 'min-content 1fr',
              width: '100%',
              height: '90vh',
              border: '1px solid #eee',
            }}
          >
            <Box
              id="main"
              sx={{
                overflow: 'auto',
                position: 'relative',
                minHeight: '0',
                gridColumn: '2/3',
                gridRow: '1/2',
              }}
            ></Box>
            <Story />
          </Box>
        </MemoryRouter>
      </Provider>
    ),
  ],
} as Meta;

const makeActivity = (activity: Partial<Activity>): Activity => ({
  id: 'id',
  location: 'window',
  content: 'Activity Content',
  title: activity.title,
  ...activity,
});

function setupActivities(activities: Activity[]) {
  activities.forEach(activity => {
    store.dispatch(activitySlice.actions.launchActivity(activity));
  });
}

export const Basic: StoryFn = () => {
  setupActivities([
    makeActivity({ id: '1', location: 'split-left', content: 'Left' }),
    makeActivity({ id: '2', location: 'split-right', content: 'Right' }),
  ]);

  return <ActivitiesRenderer />;
};

export const EmptyBar: StoryFn = () => {
  store.dispatch(activitySlice.actions.close('1'));
  store.dispatch(activitySlice.actions.close('2'));

  return <ActivitiesRenderer />;
};

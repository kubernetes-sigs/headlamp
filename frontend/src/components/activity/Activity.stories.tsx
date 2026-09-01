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
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import store from '../../redux/stores/store';
import { ActivitiesRenderer, Activity } from './Activity';
import { activitySlice } from './activitySlice';

const activityStoryIds = ['1', '2', 'long-1', 'long-2', 'short-1'];

function ActivityStoryCleanup({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return () => {
      resetActivities(activityStoryIds);
    };
  }, []);

  return <>{children}</>;
}

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
            <ActivityStoryCleanup>
              <Story />
            </ActivityStoryCleanup>
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

function resetActivities(ids: string[]) {
  ids.forEach(id => {
    store.dispatch(activitySlice.actions.close(id));
  });
}

function setupActivities(activities: Activity[]) {
  resetActivities(activities.map(activity => activity.id));

  activities.forEach(activity => {
    store.dispatch(activitySlice.actions.launchActivity(activity));
  });
}

export const Basic: StoryFn = () => {
  setupActivities([
    makeActivity({ id: '1', location: 'split-left', content: 'Left', title: 'Left Activity' }),
    makeActivity({ id: '2', location: 'split-right', content: 'Right', title: 'Right Activity' }),
  ]);

  return <ActivitiesRenderer />;
};

export const EmptyBar: StoryFn = () => {
  resetActivities(activityStoryIds);

  return <ActivitiesRenderer />;
};

export const ResponsiveContent: StoryFn = () => {
  setupActivities([
    makeActivity({
      id: 'long-1',
      location: 'window',
      cluster: 'docker-desktop-development-cluster-with-a-very-long-name',
      title: 'Pod metrics collector for a very long deployment name in the activity view',
      content: 'Long content',
    }),
    makeActivity({
      id: 'long-2',
      location: 'window',
      cluster: 'prod-eu-west-1-internal-observability',
      title: 'SomeAreVeryLongAndMightLookDifferent resource details and live logs',
      content: 'Second long content',
    }),
    makeActivity({
      id: 'short-1',
      location: 'window',
      cluster: 'dev',
      title: 'Pod',
      content: 'Short content',
    }),
  ]);

  return <ActivitiesRenderer />;
};

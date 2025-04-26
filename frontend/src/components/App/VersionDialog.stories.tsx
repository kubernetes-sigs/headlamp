import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { Provider } from 'react-redux';
import VersionDialogComponent from './VersionDialog';

const store = configureStore({
  reducer: (state = { ui: { isVersionDialogOpen: false } }) => state,
  preloadedState: {
    ui: {
      isVersionDialogOpen: true,
    },
  },
});

export default {
  title: 'Version Dialog',
  component: VersionDialogComponent,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <Provider store={store}>
          <Story />
        </Provider>
      );
    },
  ],
} as Meta;

// Let's override this function so we don't have to change the snapshot at every version change.
const getVersion = () => ({
  VERSION: '0.0.1',
  GIT_VERSION: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123',
});

const Template: StoryFn = () => {
  return <VersionDialogComponent getVersion={getVersion} />;
};

export const VersionDialog = Template.bind({});

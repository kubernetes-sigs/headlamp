import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import Message, { MessageProps } from './Message';

/**
 * What is a story?
 *
 * `npm run storybook` and see.
 *
 * https://storybook.js.org/docs/web-components/get-started/introduction
 *
 * > Storybook is a tool for UI development. It makes development faster and
 * > easier by isolating components. This allows you to work on one component
 * > at a time. You can develop entire UIs without needing to start up a
 * > complex dev stack, force certain data into your database,
 * > or navigate around your application.
 *
 */

export default {
  title: 'Message',
  component: Message,
  decorators: [
    Story => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} as Meta;

const Template: StoryFn<MessageProps> = args => <Message {...args} />;

export const Error = Template.bind({});
Error.args = {
  msg: '',
  error: true,
};

export const SmallAmount = Template.bind({});
SmallAmount.args = {
  msg: '1',
  error: false,
};

export const LargeAmount = Template.bind({});
LargeAmount.args = {
  msg: '10,000',
  error: false,
};

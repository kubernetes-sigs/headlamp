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

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import NotFoundImage from '../../../assets/headlamp-404.svg';
import ErrorComponent, { ErrorComponentProps } from '.';

export default {
  title: 'common/GenericError',
  component: ErrorComponent,
} as Meta;
const Template: StoryFn<ErrorComponentProps> = args => <ErrorComponent {...args} />;

export const Default = Template.bind({});

export const DifferentImage = Template.bind({});
DifferentImage.args = {
  graphic: NotFoundImage,
};

export const NumberGraphic = Template.bind({});
NumberGraphic.args = {
  graphic: 404,
};

export const StringGraphic = Template.bind({});
StringGraphic.args = {
  graphic: 'Oh no!',
};

export const ComponentTitle = Template.bind({});
ComponentTitle.args = {
  title: <Button onClick={() => alert("It's dead!")}>Oh no!</Button>,
};

export const StringMessage = Template.bind({});
StringMessage.args = {
  message: 'Not sure what to do!',
};

export const ComponentMessage = Template.bind({});
ComponentMessage.args = {
  message: <Typography variant="h3">Not sure what to do!</Typography>,
};

export const WithErrorStack = Template.bind({});
WithErrorStack.args = {
  error: (() => {
    const error = new Error('Unexpected error occurred');
    error.stack = `Error: Unexpected error occurred
    at ComponentName (http://localhost:3000/static/js/main.chunk.js:1234:56)
    at div
    at ErrorBoundary (http://localhost:3000/static/js/main.chunk.js:5678:90)
    at App (http://localhost:3000/static/js/main.chunk.js:9012:34)
    at Router (http://localhost:3000/static/js/main.chunk.js:3456:78)`;
    return error;
  })(),
};

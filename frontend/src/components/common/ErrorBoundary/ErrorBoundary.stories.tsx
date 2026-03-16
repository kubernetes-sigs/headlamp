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

import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import ErrorBoundary, { ErrorBoundaryProps } from './ErrorBoundary';

function BrokenComponent() {
  throw 'Error overlay only shown in dev mode. Close to see ErrorBoundary.';
  return null;
}

const storyData = {
  title: 'common/ErrorBoundary',
  component: ErrorBoundary,
  argTypes: {},
} as Meta;
export default storyData;

const Template: StoryFn<ErrorBoundaryProps> = args => (
  <ErrorBoundary {...args}>
    <i>This is not failing.</i>
  </ErrorBoundary>
);
const NoProblem = Template.bind({});
NoProblem.args = {};

// Do not run these under test, because they emit lots of console.error logs.
// It's still useful to run them in the storybook, to see and test them manually.
type StoryOrNull = StoryFn<ErrorBoundaryProps> | (() => void);
let BrokenNoFallback: StoryOrNull = () => 'disabled under test to avoid console spam';
let BrokenFallback: StoryOrNull = () => 'disabled under test to avoid console spam';
let BrokenFallbackElement: StoryOrNull = () => 'disabled under test to avoid console spam';

if (import.meta.env.UNDER_TEST !== 'true') {
  // These are only seen in the storybook, not under test.
  const BrokenTemplate: StoryFn<ErrorBoundaryProps> = args => (
    <ErrorBoundary {...args}>
      <BrokenComponent />
    </ErrorBoundary>
  );
  BrokenNoFallback = BrokenTemplate.bind({});
  BrokenNoFallback.args = {};

  const BrokenFallbackTemplate: StoryFn<ErrorBoundaryProps> = args => (
    <ErrorBoundary {...args}>
      <BrokenComponent />
    </ErrorBoundary>
  );
  BrokenFallback = BrokenFallbackTemplate.bind({});
  BrokenFallback.args = {
    fallback: ({ error }: { error: Error }) => {
      return <div>This is a fallback. Error msg: "{error.toString()}"</div>;
    },
  };

  BrokenFallbackElement = BrokenFallbackTemplate.bind({});
  BrokenFallback.args = {
    fallback: <p>A simple element</p>,
  };
}

export { NoProblem, BrokenNoFallback, BrokenFallback, BrokenFallbackElement };

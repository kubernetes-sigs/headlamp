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
import { useEffect, useRef } from 'react';
import { TestContext } from '../../../test';
import NumRowsInput from './NumRowsInput';

const TABLES_ROWS_PER_PAGE_KEY = 'tables_rows_per_page';

// NumRowsInput reads tables_rows_per_page from localStorage in a render-phase
// initializer, and the storyshot harness does not reset localStorage between
// stories. Pin the key to a fixed value before the child renders and restore it
// on unmount so the snapshot is deterministic and does not leak into other
// stories. The ref guard captures the real previous value exactly once, so a
// double render (StrictMode) doesn't record the mocked value as the original.
function WithFixedRowsPerPage({ children }: { children: React.ReactNode }) {
  const previous = useRef<string | null | undefined>(undefined);
  if (previous.current === undefined) {
    previous.current = localStorage.getItem(TABLES_ROWS_PER_PAGE_KEY);
    localStorage.setItem(TABLES_ROWS_PER_PAGE_KEY, '15');
  }
  useEffect(
    () => () => {
      if (previous.current === null || previous.current === undefined) {
        localStorage.removeItem(TABLES_ROWS_PER_PAGE_KEY);
      } else {
        localStorage.setItem(TABLES_ROWS_PER_PAGE_KEY, previous.current);
      }
    },
    []
  );
  return <>{children}</>;
}

export default {
  title: 'Settings/NumRowsInput',
  component: NumRowsInput,
  decorators: [
    Story => (
      <TestContext>
        <WithFixedRowsPerPage>
          <Story />
        </WithFixedRowsPerPage>
      </TestContext>
    ),
  ],
} as Meta<typeof NumRowsInput>;

const Template: StoryFn<typeof NumRowsInput> = args => <NumRowsInput {...args} />;

export const Default = Template.bind({});
Default.args = { defaultValue: [15, 25, 50] };

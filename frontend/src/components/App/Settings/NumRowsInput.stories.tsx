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
import { useEffect } from 'react';
import { TestContext } from '../../../test';
import NumRowsInput from './NumRowsInput';

const TABLES_ROWS_PER_PAGE_KEY = 'tables_rows_per_page';

// NumRowsInput reads tables_rows_per_page from localStorage on mount, and the
// storyshot harness does not reset localStorage between stories. Pin the key to
// a fixed value before the child renders and restore it on unmount so the
// snapshot is deterministic and does not leak into other stories.
function WithFixedRowsPerPage({ children }: { children: React.ReactNode }) {
  const previous = localStorage.getItem(TABLES_ROWS_PER_PAGE_KEY);
  localStorage.setItem(TABLES_ROWS_PER_PAGE_KEY, '15');
  useEffect(
    () => () => {
      if (previous === null) {
        localStorage.removeItem(TABLES_ROWS_PER_PAGE_KEY);
      } else {
        localStorage.setItem(TABLES_ROWS_PER_PAGE_KEY, previous);
      }
    },
    [previous]
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

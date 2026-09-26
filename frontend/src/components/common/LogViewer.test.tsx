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

import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import store from '../../redux/stores/store';
import { LogViewer } from './LogViewer';

test('does not open context menu without a selection', () => {
  const { container } = render(
    <Provider store={store}>
      <LogViewer open logs={['a log line\n']} onClose={() => {}} title="test" />
    </Provider>
  );
  const xtermContainer = container.querySelector('#xterm-container');
  xtermContainer?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  expect(container.querySelector('[role="menu"]')).not.toBeInTheDocument();
});

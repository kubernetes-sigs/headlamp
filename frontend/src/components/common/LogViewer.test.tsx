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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Terminal as XTerminal } from '@xterm/xterm';
import type { MutableRefObject } from 'react';
import { Provider } from 'react-redux';
import store from '../../redux/stores/store';
import { LogViewer } from './LogViewer';

async function renderLogViewer() {
  const xtermRef: MutableRefObject<XTerminal | null> = { current: null };
  const result = render(
    <Provider store={store}>
      <LogViewer
        noDialog
        open
        logs={['first log line\n']}
        onClose={() => {}}
        title="test"
        xtermRef={xtermRef}
      />
    </Provider>
  );
  await waitFor(() => expect(xtermRef.current?.element).toBeTruthy());
  return { ...result, xtermRef, xtermElement: result.container.querySelector('.xterm')! };
}

test('does not open context menu without a selection', async () => {
  const { xtermElement } = await renderLogViewer();

  fireEvent.contextMenu(xtermElement);

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('copies the selected text to the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  const { xtermRef, xtermElement } = await renderLogViewer();
  vi.spyOn(xtermRef.current!, 'hasSelection').mockReturnValue(true);
  vi.spyOn(xtermRef.current!, 'getSelection').mockReturnValue('first log line');

  fireEvent.contextMenu(xtermElement, { clientX: 10, clientY: 10 });
  fireEvent.click(await screen.findByRole('menuitem'));

  await waitFor(() => expect(writeText).toHaveBeenCalledWith('first log line'));
});

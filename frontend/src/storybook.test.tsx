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

import 'vitest-canvas-mock';
import { composeStories, type Meta, setProjectAnnotations, type StoryFn } from '@storybook/react';
import { act, render as testingLibraryRender, waitFor } from '@testing-library/react';
import { getWorker } from 'msw-storybook-addon';
import path from 'path';
import * as previewAnnotations from '../.storybook/preview';

const annotations = setProjectAnnotations([previewAnnotations, { testingLibraryRender }]);
beforeAll(annotations.beforeAll!);

type StoryFile = {
  default: Meta;
  [name: string]: StoryFn | Meta;
};

const compose = (entry: StoryFile) => {
  try {
    const stories = composeStories(entry);
    return stories;
  } catch (e) {
    throw new Error(
      `There was an issue composing stories for the module: ${JSON.stringify(entry)}, ${e}`
    );
  }
};

function getAllStoryFiles() {
  // Place the glob you want to match your story files
  const storyFiles = Object.entries(
    import.meta.glob<StoryFile>('./**/*.stories.tsx', {
      eager: true,
    })
  );

  return storyFiles.map(([filePath, storyFile]) => {
    const storyDir = path.dirname(filePath);
    const componentName = path.basename(filePath).replace(/\.(stories|story)\.[^/.]+$/, '');
    return { filePath, storyFile, componentName, storyDir };
  });
}

// Recreate similar options to Storyshots. Place your configuration below
const options = {
  storyKindRegex: /^.*?DontTest$/,
  snapshotsDirName: '__snapshots__',
  snapshotExtension: '.stories.storyshot',
};

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  InlineIcon: () => null,
  addCollection: () => {},
}));

vi.mock('@monaco-editor/react', () => ({
  Editor: () => <div className="mock-monaco-editor" />,
  useMonaco: () => null,
  loader: { config: () => null },
  default: () => <div className="mock-monaco-editor" />,
}));

window.matchMedia = () => ({
  matches: false,
  addListener: () => {},
  removeListener: () => {},
  media: '',
  onchange: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});
/**
 * Recursively walks the tree and replaces any usage of useId
 */
function replaceUseId(node: any) {
  const attributesToReplace = ['id', 'for', 'aria-describedby', 'aria-labelledby', 'aria-controls'];
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (const attr of node.attributes) {
      if (attributesToReplace.includes(attr.name)) {
        if (attr.value.includes(':')) {
          // Handle React useId generated IDs
          node.setAttribute(attr.name, ':mock-test-id:');
        } else if (attr.name === 'id' && attr.value.includes('recharts')) {
          // Handle recharts generated IDs
          node.setAttribute(attr.name, 'recharts-id');
        }
      }
    }

    if (node.className && typeof node.className === 'string') {
      // Replace dynamic xterm owner classes with a fixed value
      node.className = node.className.replace(
        /xterm-dom-renderer-owner-\d+/g,
        'xterm-dom-renderer-owner'
      );
    }
  }

  // Recursively update child nodes
  for (const child of node.childNodes) {
    replaceUseId(child);
  }
}

describe('Storybook Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  getAllStoryFiles().forEach(({ storyFile, componentName, storyDir }) => {
    const meta = storyFile.default;
    const title = meta.title || componentName;

    if (options.storyKindRegex.test(title) || meta.parameters?.storyshots?.disable) {
      // Skip component tests if they are disabled
      return;
    }

    describe(title, () => {
      const stories = Object.entries(compose(storyFile)).map(([name, story]) => ({
        name,
        story,
      }));

      if (stories.length <= 0) {
        throw new Error(
          `No stories found for this module: ${title}. Make sure there is at least one valid story for this module, without a disable parameter, or add parameters.storyshots.disable in the default export of this file.`
        );
      }

      stories.forEach(({ name, story }) => {
        if (story.parameters?.storyshots?.disable) return;

        test(name, async () => {
          // Keep track of sent requests to wait for the to finish
          let requestsSent = 0;
          let requestsEnded = 0;
          const worker = getWorker();
          function onStart() {
            requestsSent++;
          }
          function onEnd() {
            requestsEnded++;
          }
          worker.events.on('request:start', onStart);
          worker.events.on('request:end', onEnd);

          const unhandledRequests: Array<string> = [];

          function onUnhandledRequest(e: { request: Request }) {
            unhandledRequests.push(e.request.url);
          }
          worker.events.on('request:unhandled', onUnhandledRequest);

          act(() => {
            previewAnnotations.queryClient.clear();
          });
          await act(async () => {
            await story.run();
          });

          // There are a bunch of waterfall requests in the stories
          // So to make sure all requests are sent we need to skip over some ticks
          const tickSkipCount = 10;
          for (let i = 0; i < tickSkipCount; i++) {
            // Advance timers enough for stuff to appear
            // but not too much that things like notifications/toasts are hidden
            act(() => vi.advanceTimersByTime(100));
            await act(() => new Promise(res => process.nextTick(res)));
          }

          // And now we make sure all the requests that have been sent have ended
          await waitFor(() => {
            if (requestsSent !== requestsEnded) {
              throw new Error('waiting');
            }
          });

          expect(
            unhandledRequests,
            'MSW: intercepted a request without a matching request handler. Please create a request handler for it'
          ).toEqual([]);

          await waitFor(() => {
            if (previewAnnotations.queryClient.isFetching()) {
              const pendingQueries = previewAnnotations.queryClient
                .getQueryCache()
                .findAll({ fetchStatus: 'fetching' });

              throw new Error(
                'The react-query is still fetching following queries:\n' +
                  pendingQueries
                    .map((it, i) => String(i + 1) + ': ' + JSON.stringify(it.queryKey))
                    .join('\n')
              );
            }
          });

          // Cleanup listeners
          worker.events.removeListener('request:start', onStart);
          worker.events.removeListener('request:end', onEnd);
          worker.events.removeListener('request:unhandled', onUnhandledRequest);

          // Put snapshot next to the story
          const snapshotPath = path.join(
            storyDir,
            options.snapshotsDirName,
            `${componentName}.${name}${options.snapshotExtension}`
          );

          // Get rid of random id's in the ouput
          replaceUseId(document);

          document.body.removeAttribute('style');

          await expect(document.body).toMatchFileSnapshot(snapshotPath);
        });
      });
    });
  });
});

import { test } from 'vitest';

export function initTests() {
  console.warn(
    'Storyshots are deprecated. See more at: https://storybook.js.org/docs/writing-tests/storyshots-migration-guide/'
  );

  test.skip('Storyshots are deprecated', () => {});
}

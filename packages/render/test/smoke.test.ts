import { expect, test } from 'vitest';
import { PACKAGE } from '../src/index';

test('render loads', () => {
  expect(PACKAGE).toBe('render');
});

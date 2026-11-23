import { expect, test } from 'vitest';
import { PACKAGE } from '../src/index';

test('format loads', () => {
  expect(PACKAGE).toBe('format');
});

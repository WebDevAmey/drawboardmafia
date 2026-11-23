import { expect, test } from 'vitest';
import { PACKAGE } from '../src/index';

test('core loads', () => {
  expect(PACKAGE).toBe('core');
});

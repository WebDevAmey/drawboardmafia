import { expect, test } from 'vitest';
import { PACKAGE } from '../src/index';

test('cli loads', () => {
  expect(PACKAGE).toBe('cli');
});

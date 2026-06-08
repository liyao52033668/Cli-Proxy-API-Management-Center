import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAuthFileProblem } from './authFileProblemFilter.ts';

test('treats status message as a problem', () => {
  const result = hasAuthFileProblem(
    {
      name: 'top-error.json',
      provider: 'codex',
      statusMessage: '401 Provided authentication token is expired. Please try signing in again.',
    },
    {}
  );

  assert.equal(result, true);
});

test('treats quota error as a problem even without status message', () => {
  const result = hasAuthFileProblem(
    {
      name: 'bottom-error.json',
      provider: 'codex',
    },
    {
      codex: {
        'bottom-error.json': {
          status: 'error',
          error: 'disabled via codex inspection',
        },
      },
    }
  );

  assert.equal(result, true);
});

test('does not treat healthy file as a problem', () => {
  const result = hasAuthFileProblem(
    {
      name: 'healthy.json',
      provider: 'codex',
    },
    {
      codex: {
        'healthy.json': {
          status: 'success',
        },
      },
    }
  );

  assert.equal(result, false);
});

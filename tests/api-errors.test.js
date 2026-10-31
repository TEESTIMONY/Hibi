import test from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage } from '../src/services/api-errors.js';

test('account validation errors are readable without raw JSON or generic prefixes', () => {
  assert.equal(apiErrorMessage({ error: 'Please check the submitted fields.', details: { username: ['A user with that username already exists.'] } }), 'A user with that username already exists.');
  assert.equal(apiErrorMessage({ details: { non_field_errors: ['Unable to log in with provided credentials.'] } }), 'Unable to log in with provided credentials.');
});

test('provider errors preserve their useful explanation', () => {
  assert.equal(apiErrorMessage({ error: 'OpenAI usage or rate limit reached.', details: { detail: 'OpenAI usage or rate limit reached.' } }), 'OpenAI usage or rate limit reached.');
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validate } = require('./validate');
const { checkSchema } = require('./json-schema');

const SPEC_DIR = path.join(__dirname, '..');
const EXAMPLES_DIR = path.join(SPEC_DIR, 'examples');
const SUITE_DIR = path.join(SPEC_DIR, 'test-suite');
const SUITE = Object.freeze({ Valid: 'valid', Invalid: 'invalid' });

const jsonFiles = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const suiteCases = (kind) => jsonFiles(path.join(SUITE_DIR, kind)).map((name) => ({ name, ...readJson(path.join(SUITE_DIR, kind), name) }));

describe('PCF 0.1 validator', () => {
  for (const name of jsonFiles(EXAMPLES_DIR)) {
    it(`accepts the spec example ${name}`, () => {
      assert.deepEqual(validate(readJson(EXAMPLES_DIR, name)), []);
    });
  }

  for (const testCase of suiteCases(SUITE.Valid)) {
    it(`accepts ${testCase.name}: ${testCase.description}`, () => {
      assert.deepEqual(validate(testCase.document), []);
    });
  }

  for (const testCase of suiteCases(SUITE.Invalid)) {
    it(`rejects ${testCase.name} at ${testCase.invalidAt}: ${testCase.description}`, () => {
      const errors = validate(testCase.document);

      assert.deepEqual(errors.map((error) => error.path), [testCase.invalidAt]);
    });
  }

  it('reports where a document is wrong and why', () => {
    const errors = validate({ format: 'page-change-format', version: '0.1', items: [{ id: 'a1', type: 'edit', status: 'open' }] });

    assert.deepEqual(errors, [{ path: '/items/0/target', message: 'is required' }]);
  });
});

describe('JSON schema checker', () => {
  it('refuses a schema keyword it does not support, so the schema cannot drift from what is checked', () => {
    assert.throws(() => checkSchema('a', { maxLength: 0 }), /does not support/);
  });

  it('refuses a reference outside the schema', () => {
    assert.throws(() => checkSchema('a', { $ref: 'https://example.com/other.json' }), /cannot resolve/);
  });
});

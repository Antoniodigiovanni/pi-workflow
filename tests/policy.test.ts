import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy, assertAggregateAllowed, assertNonSensitive } from '../src/policy.ts';
const basic = 'project:\n  type: internal\n';
test('internal service policy defaults deny discovery without scope', () => {
  const p = parsePolicy(basic);
  assert.equal(p.databricks.enabled, false);
  assert.equal(p.mlflow.enabled, false);
  assert.deepEqual(p.data_policy.approved_models, []);
});
test('malformed and unknown service policy fields fail closed', () => {
  for (const source of ['', basic.replace('internal', 'other'), basic + 'data_policy:\n  allow_sampels: true', basic + 'project: {}', basic.replace('  type: internal\n', '')]) assert.throws(() => parsePolicy(source));
});
test('aggregate tables and columns require explicit approval', () => {
  const p = parsePolicy(basic + 'databricks:\n  enabled: true\n  allowed_catalogs: [a]\n  allowed_schemas: [a.b]\n  approved_tables:\n    a.b.c: [x]\n');
  assert.doesNotThrow(() => assertAggregateAllowed(p, 'a.b.c', ['x']));
  assert.throws(() => assertAggregateAllowed(p, 'a.b.c', ['y']));
  assert.throws(() => assertAggregateAllowed(p, 'a.d.c', ['x']));
  assert.throws(() => assertNonSensitive(p, [{key:'classification', value:'PII'}]));
});

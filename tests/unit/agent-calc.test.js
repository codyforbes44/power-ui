'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserGlobal } = require('../helpers/loadBrowserGlobal');

// SuperAgent.calc is the dependency-free, eval-free math evaluator that
// replaced the Function()-based sandbox escape in the `calculate` tool.
const SuperAgent = loadBrowserGlobal('app/agent.js', 'SuperAgent');
const calc = SuperAgent.calc;

test('SuperAgent exposes calc()', () => {
  assert.equal(typeof calc, 'function');
});

test('evaluates basic arithmetic with correct precedence', () => {
  assert.equal(calc('2+2*3'), 8);
  assert.equal(calc('(2+2)*3'), 12);
  assert.equal(calc('10 - 4 - 3'), 3);      // left-associative
  assert.equal(calc('10 % 3'), 1);
  assert.equal(calc('7 / 2'), 3.5);
});

test('supports ** and ^ exponentiation (right-associative)', () => {
  assert.equal(calc('2 ** 10'), 1024);
  assert.equal(calc('2 ^ 10'), 1024);
  assert.equal(calc('2 ^ 3 ^ 2'), 512);     // 2^(3^2), not (2^3)^2
});

test('handles the advertised finance/compound-interest example', () => {
  const viaOperator = calc('1000*(1+0.07)**10');
  const viaPow = calc('Math.pow(1000*1.07,10)');
  assert.ok(Math.abs(viaOperator - 1967.151357) < 1e-3, `got ${viaOperator}`);
  assert.ok(viaPow > 0);
});

test('supports allowlisted Math functions and constants', () => {
  assert.equal(calc('Math.sqrt(144)'), 12);
  assert.equal(calc('Math.max(1, 5, 3)'), 5);
  assert.equal(calc('Math.min(1, 5, 3)'), 1);
  assert.equal(calc('Math.abs(-42)'), 42);
  assert.equal(calc('Math.floor(3.9)'), 3);
  assert.equal(calc('Math.round(2.5)'), 3);
  assert.equal(calc('Math.pow(2, 8)'), 256);
  assert.ok(Math.abs(calc('Math.PI') - Math.PI) < 1e-12);
  assert.ok(Math.abs(calc('Math.log(1000)/Math.log(10)') - 3) < 1e-9);
  assert.ok(Math.abs(calc('Math.sin(Math.PI/6)') - 0.5) < 1e-9);
});

test('handles unary minus and scientific notation', () => {
  assert.equal(calc('-5 + 3'), -2);
  assert.equal(calc('2 * -3'), -6);
  assert.equal(calc('1e3'), 1000);
  assert.equal(calc('1.5e-2'), 0.015);
});

// ── Security: the whole point of this evaluator ──────────────
test('rejects the fromCharCode/fetch exfiltration payload', () => {
  assert.throws(() => calc('fetch(String.fromCharCode(104,116,116,112))'), /Unknown identifier/);
});

test('rejects arbitrary identifiers that are not on the Math allowlist', () => {
  for (const evil of [
    'fetch',
    'document.cookie',
    'window.location',
    'globalThis',
    'self',
    'String.fromCharCode(65)',
    'constructor',
    'this',
    'Math.constructor',
    'Function("return 1")',
    'process.exit(1)',
    'eval("1")',
    'Math',            // bare Math is not a value
  ]) {
    assert.throws(() => calc(evil), /Unknown identifier|Unexpected|Expected/, `should reject: ${evil}`);
  }
});

test('rejects empty and malformed expressions', () => {
  assert.throws(() => calc(''), /Empty/);
  assert.throws(() => calc('   '), /Empty/);
  assert.throws(() => calc('2 +'), /Unexpected end/);
  assert.throws(() => calc('2 2'), /trailing/);
  assert.throws(() => calc('(2 + 3'), /Expected \)/);
  assert.throws(() => calc('@#$'), /Unexpected character/);
});

test('rejects overly long input', () => {
  assert.throws(() => calc('1+'.repeat(300) + '1'), /too long/);
});

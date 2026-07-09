'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserGlobal, makeStorage } = require('../helpers/loadBrowserGlobal');

function freshMemorySystem() {
  // Each test gets its own isolated localStorage — MemorySystem is loaded
  // fresh per test so workspace/memory state never leaks between tests.
  return loadBrowserGlobal('app/memory.js', 'MemorySystem', { localStorage: makeStorage() });
}

test('ensureDefault creates exactly one active workspace on first run', () => {
  const MemorySystem = freshMemorySystem();
  MemorySystem.init();
  const all = MemorySystem.workspaces.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].active, true);

  // Calling init() again must not create a second workspace
  MemorySystem.init();
  assert.equal(MemorySystem.workspaces.list().length, 1);
});

test('search ranks exact keyword matches above partial matches', () => {
  const MemorySystem = freshMemorySystem();
  const ws = MemorySystem.workspaces.create('Test WS');
  MemorySystem.memories.add(ws.id, { key: 'deploy target', value: 'Netlify static hosting' });
  MemorySystem.memories.add(ws.id, { key: 'unrelated', value: 'coffee preferences' });

  const results = MemorySystem.memories.search(ws.id, 'netlify deploy', 5);
  assert.ok(results.length >= 1);
  assert.equal(results[0].key, 'deploy target');
});

test('search returns nothing for a query with no overlap', () => {
  const MemorySystem = freshMemorySystem();
  const ws = MemorySystem.workspaces.create('Test WS');
  MemorySystem.memories.add(ws.id, { key: 'deploy target', value: 'Netlify static hosting' });

  const results = MemorySystem.memories.search(ws.id, 'xyzzy quux', 5);
  // [...results] re-materializes the array in this realm — see comment in
  // loadBrowserGlobal.js about vm sandbox values living in a separate realm.
  assert.deepEqual([...results], []);
});

test('search increments useCount on returned memories', () => {
  const MemorySystem = freshMemorySystem();
  const ws = MemorySystem.workspaces.create('Test WS');
  const mem = MemorySystem.memories.add(ws.id, { key: 'redis cache', value: 'used for session storage' });

  MemorySystem.memories.search(ws.id, 'redis', 5);
  const after = MemorySystem.memories.list(ws.id).find(m => m.id === mem.id);
  assert.equal(after.useCount, 1);
});

test('buildContext returns empty string when nothing relevant is found', () => {
  const MemorySystem = freshMemorySystem();
  const ws = MemorySystem.workspaces.create('Test WS');
  assert.equal(MemorySystem.memories.buildContext(ws.id, 'nothing stored yet'), '');
});

test('buildContext formats matched memories as a markdown list', () => {
  const MemorySystem = freshMemorySystem();
  const ws = MemorySystem.workspaces.create('Test WS');
  MemorySystem.memories.add(ws.id, { key: 'stack', value: 'Python + vanilla JS, no framework' });

  const ctx = MemorySystem.memories.buildContext(ws.id, 'what stack are we using');
  assert.match(ctx, /## Remembered Context/);
  assert.match(ctx, /\*\*stack\*\*: Python \+ vanilla JS, no framework/);
});

test('deleting a workspace also deletes its memories', () => {
  const MemorySystem = freshMemorySystem();
  const ws = MemorySystem.workspaces.create('Temp WS');
  MemorySystem.memories.add(ws.id, { key: 'a', value: 'b' });
  MemorySystem.workspaces.delete(ws.id);
  assert.deepEqual([...MemorySystem.memories.list(ws.id)], []);
});

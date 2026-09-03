import assert from 'node:assert/strict';
import test from 'node:test';

import { mapScrollPosition } from '../scrollSync.js';

test('interpolates both ways around a preview block taller than its source', () => {
  const sourceToPreview = [[50, 100], [100, 500], [150, 650]];

  assert.equal(mapScrollPosition(75, 200, 800, sourceToPreview), 300);
  assert.equal(mapScrollPosition(300, 800, 200, sourceToPreview.map(([source, preview]) => [preview, source])), 75);
  assert.equal(mapScrollPosition(0, 200, 800, sourceToPreview), 0);
  assert.equal(mapScrollPosition(200, 200, 800, sourceToPreview), 800);
});

test('clamps boundaries and handles short or unrenderable documents', () => {
  assert.equal(mapScrollPosition(-10, 200, 800), 0);
  assert.equal(mapScrollPosition(300, 200, 800), 800);
  assert.equal(mapScrollPosition(50, 200, 800), 200);
  assert.equal(mapScrollPosition(50, 0, 800), 0);
  assert.equal(mapScrollPosition(50, 200, 0), 0);
  assert.equal(mapScrollPosition(50, 200, 800, [[NaN, 20], [25, Infinity], [300, 900]]), 200);
});

test('shared line boundaries remain continuous and never reverse the target scroll', () => {
  const anchors = [[100, 500], [50, 100], [50, 200], [75, 150]];
  assert.equal(mapScrollPosition(50, 200, 800, anchors), 200);
  assert.ok(Math.abs(mapScrollPosition(50.01, 200, 800, anchors) - 200) < 1);
  let previous = 0;
  for (let top = 0; top <= 200; top += 1) {
    const next = mapScrollPosition(top, 200, 800, anchors);
    assert.ok(next >= previous && next <= 800);
    previous = next;
  }
});

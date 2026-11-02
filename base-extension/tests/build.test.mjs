import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const read = (file) => readFile(path.join(dist, file), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const files = await readdir(dist, { recursive: true });

async function assertAsset(reference, importer = '') {
  assert.equal(typeof reference, 'string');
  assert.ok(!/^(?:[a-z]+:|\/\/)/i.test(reference), `Remote resource: ${reference}`);
  const file = reference.startsWith('/')
    ? reference.slice(1)
    : path.join(path.dirname(importer), reference);
  const resolved = path.resolve(dist, file);
  assert.ok(resolved.startsWith(dist), `Resource escapes dist: ${reference}`);
  assert.ok((await stat(resolved)).isFile(), `Missing asset: ${file}`);
}

test('production manifest has the required MV3 fields and minimal permissions', async () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name.length > 0 && manifest.name.length <= 75);
  assert.match(manifest.version, /^\d+(?:\.\d+){0,3}$/);
  assert.equal(manifest.minimum_chrome_version, '120');
  assert.deepEqual(manifest.permissions.toSorted(), ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.background, undefined, 'This starter does not need a production worker');
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.content_security_policy, undefined, 'Use Chrome default extension CSP');
  await assertAsset(manifest.action.default_popup);
  for (const icon of Object.values(manifest.icons)) await assertAsset(icon);
  assert.equal((manifest.web_accessible_resources ?? []).length, 0);
  assert.ok(!files.some((file) => file.startsWith('src/content/')), 'No stale content bundle');
});

test('popup and emitted code reference existing, local resources', async () => {
  const html = await read(manifest.action.default_popup);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /<script[^>]+type="module"[^>]+src=/);
  assert.doesNotMatch(html, /<script[^>]*>\s*[^<\s]/, 'No inline executable scripts');
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    await assertAsset(reference, manifest.action.default_popup);
  }
  for (const file of files.filter((file) => file.endsWith('.js'))) {
    const code = await read(file);
    for (const [, , reference] of code.matchAll(
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])([^'"]+)\1/g,
    )) {
      await assertAsset(reference, file);
    }
    assert.doesNotMatch(code, /\beval\s*\(/);
    assert.doesNotMatch(code, /localhost:5173|@vite\/client|react-refresh/);
  }
  for (const file of files.filter((file) => file.endsWith('.css'))) {
    const css = await read(file);
    for (const [, reference] of css.matchAll(/url\(["']?([^\s)"']+)["']?\)/g)) {
      await assertAsset(reference, file);
    }
  }
});

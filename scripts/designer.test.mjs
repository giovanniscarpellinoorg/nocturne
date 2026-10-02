import {modelFetcher} from './fixtures/model-catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, stat, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateSprite, normalizeSprite, compactSprite, spriteSizes} from '../dist/pixels.mjs';
import {rasterizeCommands} from '../dist/drawing-tools.mjs';
import {createCloud, DEFAULT_MODEL} from './cloud.mjs';
import {createServer} from './server.mjs';

const sprite = {name: 'Lanterne', description: 'Une flamme dorée.', width: 16, height: 16, pixels: [{x: 7, y: 6, rgba: '#dfb77b'}, {x: 8, y: 6, rgba: '#10203080'}]};
const options = {prompt: 'Une lanterne dorée', size: 16, model: DEFAULT_MODEL};
const response = value => new Response(JSON.stringify({done: true, message: {content: JSON.stringify(value)}}));
async function fixture(t, fetcher) {
  const directory = await mkdtemp(path.join(tmpdir(), 'nocturne-designer-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const config = {modelFetcher,secretDir: path.join(directory, 'credentials'), cacheDir: path.join(directory, 'dungeons'), spriteDir: path.join(directory, 'sprites'), environmentKey: 'fake-key-for-offline-tests', fetcher};
  return {config, cloud: createCloud(config)};
}

test('pixel validation enforces bounds, colors, dimensions and visible content', () => {
  assert.equal(validateSprite(sprite).pixels[0].rgba, '#DFB77BFF');
  for (const value of [
    {...sprite, width: 32}, {...sprite, height: 24}, {...sprite, pixels: []},
    {...sprite, pixels: [{x: 16, y: 0, rgba: '#ffffff'}]},
    {...sprite, pixels: [{x: .5, y: 0, rgba: '#ffffff'}]},
    {...sprite, pixels: [{x: 0, y: -1, rgba: '#ffffff'}]},
    {...sprite, pixels: [{x: 0, y: 0, rgba: 'red'}]},
    {...sprite, pixels: [{x: 0, y: 0, rgba: '#ffffff00'}]},
    {...sprite, pixels: Array.from({length: 17}, (_, i) => ({x: i % 16, y: Math.floor(i / 16), rgba: '#' + i.toString(16).padStart(6, '0')}))},
  ]) assert.throws(() => validateSprite(value));
  assert.throws(() => validateSprite(sprite, 24));
});

test('drawings are persisted, reloadable and sent as actual pixels when used as references', async t => {
  const requests = [];
  const {config, cloud} = await fixture(t, async (url, init) => {assert.equal(url, 'https://ollama.com/api/chat'); requests.push(JSON.parse(init.body)); return response(sprite);});
  assert.deepEqual(await cloud.listSprites(), []);
  const first = await cloud.design(options);
  assert.equal(first.reused, false);
  assert.equal((await stat(path.join(config.spriteDir, first.record.id + '.json'))).mode & 0o777, 0o600);
  const reopened = createCloud(config);
  assert.deepEqual(await reopened.listSprites(), [first.record]);
  const variation = await reopened.design({...options, referenceId: first.record.id, prompt: 'Une flamme bleue'});
  assert.notEqual(variation.record.id, first.record.id);
  assert.equal(variation.record.referenceId, first.record.id);
  assert.match(requests[1].messages[1].content, /#DFB77BFF/);
  assert.match(requests[1].messages[1].content, /Une flamme bleue/);
  assert.equal((await reopened.listSprites()).length, 2);
});

test('an uploaded visual reference is sent to Ollama as an image without being stored in the sprite archive', async t => {
  let request;
  const {config, cloud} = await fixture(t, async (_, init) => {request = JSON.parse(init.body); return response(sprite);});
  const image = Buffer.alloc(300, 0xaa).toString('base64');
  const result = await cloud.design({...options, referenceImage: image, referenceImageMime: 'image/jpeg'});
  assert.deepEqual(request.messages[1].images, [image]);
  assert.match(request.messages[1].content, /image de référence visuelle/i);
  assert.equal(result.record.referenceImage, undefined);
  assert.equal(JSON.stringify(await cloud.readDesignLog(result.diagnosticId)).includes(image), false);
  assert.equal((await readFile(path.join(config.spriteDir, result.record.id + '.json'), 'utf8')).includes(image), false);
});

test('Ollama may reuse only a permitted saved drawing of the requested size', async t => {
  const {config, cloud} = await fixture(t, async () => response(sprite));
  const first = await cloud.design(options);
  let request;
  const reuse = createCloud({modelFetcher,...config, fetcher: async (_, init) => {request = JSON.parse(init.body); return response({reuseId: first.record.id});}});
  const reused = await reuse.design({...options, allowReuse: true});
  assert.deepEqual(reused.record, first.record); assert.equal(reused.reused, true); assert.ok(reused.diagnosticId);
  assert.match(request.messages[1].content, new RegExp(first.record.id));
  assert.equal((await reuse.listSprites()).length, 1);
  for (const extra of [{allowReuse: false}, {allowReuse: true, size: 24}]) {
    const denied = createCloud({modelFetcher,...config, fetcher: async () => response({reuseId: first.record.id})});
    await assert.rejects(denied.design({...options, ...extra}), e => e.status === 422);
  }
});

test('invalid options, missing reference and invalid model outputs never create or overwrite drawings', async t => {
  let calls = 0;
  const {config, cloud} = await fixture(t, async () => {calls++; return response(sprite);});
  for (const change of [{size: 999}, {model: 'unknown'}, {prompt: ''}, {prompt: 'x'.repeat(1001)}, {referenceId: '../credentials/key'}, {allowReuse: 'yes'}, {referenceImage: 'not-base64', referenceImageMime: 'image/jpeg'}, {referenceImage: Buffer.alloc(300, 1).toString('base64')}, {code: 'bad'}]) {
    await assert.rejects(cloud.design({...options, ...change}), e => e.status === 400);
  }
  assert.equal(calls, 0);
  const first = await cloud.design(options);
  for (const fetcher of [
    async () => response({...sprite, pixels: []}),
    async () => new Response(JSON.stringify({done_reason: 'length', message: {content: JSON.stringify(sprite)}})),
    async () => new Response(JSON.stringify({message: {content: '<script>oops</script>'}})),
    async () => response({reuseId: '00000000-0000-0000-0000-000000000000'}),
  ]) {
    const broken = createCloud({modelFetcher,...config, fetcher});
    await assert.rejects(broken.design(options), e => e.status === 422);
    assert.deepEqual(await broken.listSprites(), [first.record]);
  }
  await writeFile(path.join(config.spriteDir, '00000000-0000-0000-0000-000000000000.json'), 'bad json');
  assert.deepEqual(await cloud.listSprites(), [first.record]);
  const missing = createCloud(config);
  await assert.rejects(missing.design({...options, referenceId: '11111111-1111-1111-1111-111111111111'}), e => e.status === 404);
  assert.equal(calls, 1);
});

test('drawing and dungeon generation share a lock and cooldown', async t => {
  let finish;
  const {cloud} = await fixture(t, () => new Promise(resolve => {finish = resolve;}));
  const pending = cloud.design(options);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await cloud.status()).busy, true);
  await assert.rejects(cloud.design(options), e => e.status === 409);
  await assert.rejects(cloud.generate({mode: 'experiment'}), e => e.status === 409);
  finish(response(sprite)); await pending;
  assert.equal((await cloud.status()).busy, false);
  await assert.rejects(cloud.design(options), e => e.status === 429);
});

test('designer API uses local request protection and exposes the page and saved drawings', async t => {
  const {cloud} = await fixture(t, async () => response(sprite));
  const server = createServer({cloud});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const {token} = await (await fetch(origin + '/api/session')).json();
  const headers = {'Content-Type': 'application/json', 'X-Nocturne-Token': token, Origin: origin};
  for (const badHeaders of [{...headers, Origin: 'https://example.com'}, {...headers, 'X-Nocturne-Token': 'wrong'}]) {
    assert.equal((await fetch(origin + '/api/designer/generate', {method: 'POST', headers: badHeaders, body: JSON.stringify(options)})).status, 403);
  }
  const generated = await fetch(origin + '/api/designer/generate', {method: 'POST', headers, body: JSON.stringify(options)});
  assert.equal(generated.status, 200);
  const result = await generated.json();
  const logs = await (await fetch(origin + '/api/designer/logs')).json();
  assert.equal(logs[0].id, result.diagnosticId);
  assert.equal(logs[0].rawResponse, undefined);
  const detail = await (await fetch(origin + '/api/designer/logs/' + result.diagnosticId)).json();
  assert.equal(detail.status, 'success'); assert.ok(detail.rawResponse);
  assert.equal((await fetch(origin + '/api/designer/logs/not-an-id')).status, 404);
  assert.equal((await (await fetch(origin + '/api/designer/sprites')).json()).length, 1);
  assert.equal((await fetch(origin + '/designer.html')).status, 200);
  assert.equal((await fetch(origin + '/.private/sprites/')).status, 404);
});

test('duplicate pixels are collapsed in order, with accurate diagnostics and final palette', () => {
  const pixels = [sprite.pixels[0], sprite.pixels[0], {...sprite.pixels[0], rgba: '#abcdef'}, sprite.pixels[1]];
  const result = normalizeSprite({...sprite, pixels});
  assert.deepEqual(result.sprite.pixels, [{x: 7, y: 6, rgba: '#ABCDEFFF'}, {x: 8, y: 6, rgba: '#10203080'}]);
  assert.equal(result.diagnostics.duplicatePixels, 2);
  assert.equal(result.diagnostics.overwrittenPixels, 1);
  assert.equal(result.diagnostics.uniquePixels, 2);
  const repaint = Array.from({length: 257}, (_, i) => ({x: 0, y: 0, rgba: '#' + i.toString(16).padStart(6, '0')}));
  assert.equal(validateSprite({...sprite, pixels: repaint}).pixels.length, 1);
  assert.throws(() => validateSprite({...sprite, pixels: [sprite.pixels[0], {...sprite.pixels[0], rgba: '#00000000'}]}), /transparent/);
});

test('every supported size can round-trip all pixels through compact rows and transparent gaps', () => {
  for (const size of spriteSizes) {
    const dense = {...sprite, width: size, height: size, pixels: Array.from({length: size * size}, (_, i) => ({x: i % size, y: Math.floor(i / size), rgba: i % 2 ? '#FFEEDDFF' : '#AABBCC88'}))};
    assert.deepEqual(validateSprite(compactSprite(dense), size), dense);
    const sparse = {...dense, pixels: dense.pixels.filter(p => p.x % 2 === 0)};
    assert.deepEqual(validateSprite(compactSprite(sparse), size), sparse);
  }
  const compact = compactSprite(validateSprite(sprite));
  for (const changed of [
    {...compact, rows: compact.rows.map((r, i) => i === 0 ? 'F' + r.slice(1) : r)},
    {...compact, palette: ['red']}, {...compact, pixels: sprite.pixels},
  ]) assert.throws(() => validateSprite(changed));
});

test('large drawings use compact instructions, survive persistence and expose logs without keys', async t => {
  const large = {...sprite, width: 64, height: 64};
  let sent;
  const {cloud, config} = await fixture(t, async (_, init) => {sent = JSON.parse(init.body); return response(compactSprite(validateSprite(large)));});
  const result = await cloud.design({...options, size: 64});
  assert.equal(result.record.sprite.width, 64);
  assert.equal(result.diagnostics.format, 'rows');
  assert.match(sent.messages[1].content, /EXACTEMENT 64/);
  assert.equal(result.logSaved, true);
  const log = await cloud.readDesignLog(result.diagnosticId);
  assert.equal(log.status, 'success');
  assert.equal(log.request.size, 64);
  assert.ok(log.events.some(e => e.stage === 'pixels_validated'));
  assert.ok(log.rawResponse.includes('rows'));
  assert.ok(!JSON.stringify(log).includes(config.environmentKey));
  assert.equal((await stat(path.join(config.spriteDir, 'logs', log.id + '.json'))).mode & 0o777, 0o600);
});

test('duplicate repair is logged; invalid output retains raw response and identifies its log', async t => {
  const {cloud, config} = await fixture(t, async () => response({...sprite, pixels: [...sprite.pixels, sprite.pixels[0]]}));
  const result = await cloud.design(options);
  assert.equal(result.diagnostics.duplicatePixels, 1);
  assert.ok((await cloud.readDesignLog(result.diagnosticId)).events.some(e => e.stage === 'duplicates_resolved'));
  const broken = createCloud({modelFetcher,...config, fetcher: async () => response({wrong: config.environmentKey})});
  let failed;
  await assert.rejects(broken.design(options), e => {failed = e; return e.status === 422 && Boolean(e.diagnosticId);});
  const log = await broken.readDesignLog(failed.diagnosticId);
  assert.equal(log.status, 'error');
  assert.ok(log.rawResponse.includes('[REDACTED]'));
  assert.ok(!JSON.stringify(log).includes(config.environmentKey));
  assert.equal((await broken.listDesignLogs()).length, 2);
  assert.equal((await broken.listSprites()).length, 1);
});

test('provider failures keep HTTP status and response in a diagnostic journal', async t => {
  const {cloud} = await fixture(t, async () => new Response('{"error":"quota exceeded"}', {status: 429}));
  let failed;
  await assert.rejects(cloud.design(options), e => {failed = e; return e.status === 429;});
  const log = await cloud.readDesignLog(failed.diagnosticId);
  assert.equal(log.status, 'error');
  assert.match(log.rawResponse, /quota exceeded/);
  assert.ok(log.events.some(event => event.stage === 'provider_error' && event.httpStatus === 429));
});

test('the actual 65-row corgi response is repaired without losing or moving any colored pixel', async t => {
  const corgi = JSON.parse(await readFile(new URL('./fixtures/corgi-64.json', import.meta.url), 'utf8'));
  const expectedPixels = corgi.rows.flatMap((row, y) => [...row].flatMap((symbol, x) => symbol === '.' ? [] : [{x, y, rgba: corgi.palette[parseInt(symbol, 16)]}]));
  assert.equal(corgi.rows.length, 65);
  assert.equal(expectedPixels.length, 1031);
  const {sprite: repaired, diagnostics} = normalizeSprite(corgi, 64);
  assert.deepEqual(repaired.pixels, expectedPixels);
  assert.equal(diagnostics.gridRepairs.length, 23);
  assert.equal(diagnostics.gridRepairs.filter(r => r.type === 'trim-transparent-row').length, 1);
  assert.equal(compactSprite(repaired).rows.length, 64);
  assert.ok(compactSprite(repaired).rows.every(row => row.length === 64));
  const {cloud} = await fixture(t, async () => response(corgi));
  const result = await cloud.design({...options, size: 64});
  assert.deepEqual(result.record.sprite, repaired);
  const log = await cloud.readDesignLog(result.diagnosticId);
  assert.equal(log.status, 'success');
  assert.equal(log.diagnostics.gridRepairs.length, 23);
  assert.ok(log.events.some(event => event.stage === 'transparent_margins_repaired'));
});

test('transparent row suffixes are padded but colored overflow and malformed rows remain rejected', () => {
  const compact = compactSprite(validateSprite(sprite));
  const short = {...compact, rows: compact.rows.slice(0, 7).map(row => row.replace(/\.+$/, ''))};
  assert.deepEqual(validateSprite(short), validateSprite(sprite));
  for (const changed of [
    {...compact, rows: [...compact.rows, '.0']},
    {...compact, rows: compact.rows.map((r, i) => i === 0 ? r + '0' : r)},
    {...compact, rows: compact.rows.map((r, i) => i === 0 ? r + 'Z' : r)},
    {...compact, rows: compact.rows.map((r, i) => i === 0 ? 123 : r)},
    {...compact, rows: compact.rows.map((r, i) => i === 0 ? '.'.repeat(33) : r)},
    {...compact, rows: Array(33).fill('')},
    {...compact, rows: []},
  ]) assert.throws(() => validateSprite(changed));
  assert.deepEqual(validateSprite({...compact, rows: [...compact.rows, '....']}), validateSprite(sprite));
});

test('drawing tools produce exact pixels, layering and transparent erasure', () => {
  const result = rasterizeCommands([
    {outil: 'rectangle', x: 1, y: 1, largeur: 3, hauteur: 2, couleur: '#FF0000'},
    {outil: 'ligne', de: [0, 0], vers: [3, 3], couleur: '#00FF00'},
    {outil: 'pixel', x: 2, y: 2, couleur: '#00000000'},
  ], 8, 8);
  assert.deepEqual(result.pixels, [
    {x: 0, y: 0, rgba: '#00FF00FF'}, {x: 1, y: 1, rgba: '#00FF00FF'},
    {x: 2, y: 1, rgba: '#FF0000FF'}, {x: 3, y: 1, rgba: '#FF0000FF'},
    {x: 1, y: 2, rgba: '#FF0000FF'}, {x: 3, y: 2, rgba: '#FF0000FF'},
    {x: 3, y: 3, rgba: '#00FF00FF'},
  ]);
  assert.equal(result.stats.commandCount, 3);
  assert.equal(result.stats.repaintedPixels, 3);
  assert.equal(result.commands[0].couleur, '#FF0000FF');
  const semi = rasterizeCommands([
    {outil: 'pixel', x: 1, y: 1, couleur: '#FF0000'},
    {outil: 'pixel', x: 1, y: 1, couleur: '#0000FF80'},
  ], 8, 8);
  assert.equal(semi.pixels[0].rgba, '#0000FF80');
});

test('ellipses and polygons have deterministic filled footprints', () => {
  const footprint = commands => rasterizeCommands(commands, 8, 8).pixels.map(p => `${p.x},${p.y}`);
  assert.deepEqual(footprint([{outil: 'ellipse', x: 1, y: 1, largeur: 4, hauteur: 4, couleur: '#FFFFFF'}]),
    ['2,1', '3,1', '1,2', '2,2', '3,2', '4,2', '1,3', '2,3', '3,3', '4,3', '2,4', '3,4']);
  assert.deepEqual(footprint([{outil: 'polygone', points: [[1, 1], [3, 1], [3, 3], [1, 3]], couleur: '#FFFFFF'}]),
    ['1,1', '2,1', '3,1', '1,2', '2,2', '3,2', '1,3', '2,3', '3,3']);
  for (const [endX, endY] of [[0,0],[0,3],[0,7],[3,0],[3,3],[3,7],[7,0],[7,3],[7,7]]) {
    const pixels = footprint([{outil: 'ligne', de: [3,3], vers: [endX,endY], couleur: '#FFFFFF'}]);
    assert.ok(pixels.includes('3,3')); assert.ok(pixels.includes(`${endX},${endY}`));
    assert.equal(pixels.length, Math.max(Math.abs(endX - 3), Math.abs(endY - 3)) + 1);
  }
});

test('tool commands reject unbounded, unknown or executable data and preserve pixel validation', () => {
  const pixel = {outil: 'pixel', x: 1, y: 1, couleur: '#FFFFFF'};
  for (const commands of [[], Array(257).fill(pixel), [null], [{...pixel, outil: '__proto__'}], [{...pixel, code: 'anything'}], [{...pixel, x: -1}], [{...pixel, x: 8}], [{...pixel, x: 1.5}], [{...pixel, couleur: 'red'}],
    [{outil: 'rectangle', x: 7, y: 7, largeur: 2, hauteur: 2, couleur: '#FFFFFF'}],
    [{outil: 'ellipse', x: 1, y: 1, largeur: 0, hauteur: 2, couleur: '#FFFFFF'}],
    [{outil: 'ligne', de: [1,1], vers: [8,8], couleur: '#FFFFFF'}],
    [{outil: 'polygone', points: [[1,1],[2,2]], couleur: '#FFFFFF'}],
  ]) assert.throws(() => rasterizeCommands(commands, 8, 8));
  const {pixels, ...meta} = sprite;
  assert.throws(() => normalizeSprite({...meta, commands: [{...pixel, couleur: '#00000000'}]}));
  assert.throws(() => normalizeSprite({...sprite, commands: [pixel]}));
  const normalized = normalizeSprite({...meta, commands: [pixel]});
  assert.equal(normalized.diagnostics.format, 'commands');
  assert.equal(normalized.diagnostics.duplicatePixels, 0);
  assert.deepEqual(validateSprite(normalized.sprite), normalized.sprite);
});

test('tools mode survives API, storage, logs, exports and reference reuse', async t => {
  const {pixels, ...meta} = sprite;
  const design = {...meta, commands: [{outil: 'rectangle', x: 2, y: 2, largeur: 6, hauteur: 8, couleur: '#dfb77b'}, {outil: 'pixel', x: 4, y: 4, couleur: '#000000'}]};
  const requests = [];
  const {config, cloud} = await fixture(t, async (_, init) => {requests.push(JSON.parse(init.body)); return response(design);});
  const first = await cloud.design({...options, method: 'tools'});
  assert.equal(first.record.method, 'tools');
  assert.equal(first.record.drawing.commands.length, 2);
  assert.equal(first.record.sprite.pixels.length, 48);
  assert.equal(first.diagnostics.commandCount, 2);
  assert.match(requests[0].messages[1].content, /"outil":"ellipse"/);
  assert.doesNotMatch(requests[0].messages[1].content, /rows représente une grille/);
  assert.deepEqual(await createCloud(config).listSprites(), [first.record]);
  const log = await cloud.readDesignLog(first.diagnosticId);
  assert.equal(log.method, 'tools');
  assert.ok(log.events.some(e => e.stage === 'commands_rendered'));
  await createCloud(config).design({...options, method: 'tools', referenceId: first.record.id});
  assert.match(requests[1].messages[1].content, /"couleur":"#DFB77BFF"/);
  assert.match(requests[1].messages[1].content, /"commands":/);
  const wrongFormat = createCloud({modelFetcher,...config, fetcher: async () => response(sprite)});
  await assert.rejects(wrongFormat.design({...options, method: 'tools'}), e => e.status === 422);
  await assert.rejects(createCloud(config).design({...options, method: 'code'}), e => e.status === 400);
});

test('tools comparison cannot reuse a previous pixels-mode drawing', async t => {
  const {config, cloud} = await fixture(t, async () => response(sprite));
  const previous = await cloud.design(options);
  const reuse = createCloud({modelFetcher,...config, fetcher: async () => response({reuseId: previous.record.id})});
  await assert.rejects(reuse.design({...options, method: 'tools', allowReuse: true}), e => e.status === 422);
});

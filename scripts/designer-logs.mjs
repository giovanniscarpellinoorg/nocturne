import {mkdir, readFile, readdir, writeFile, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

export const validLogId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

export function createDesignLogs(directory, PublicError) {
  async function read(id) {
    if (!validLogId(id)) throw new PublicError(404, 'Journal introuvable.');
    try {return JSON.parse(await readFile(path.join(directory, `${id}.json`), 'utf8'));}
    catch {throw new PublicError(404, 'Journal introuvable.');}
  }
  async function list() {
    let files;
    try {files = await readdir(directory);} catch (e) {if (e.code === 'ENOENT') return []; throw e;}
    const logs = [];
    for (const file of files) {
      if (!file.endsWith('.json') || !validLogId(file.slice(0, -5))) continue;
      try {
        const {id, startedAt, status, model, size, durationMs, error, diagnostics} = await read(file.slice(0, -5));
        logs.push({id, startedAt, status, model, size, durationMs, error, diagnostics});
      } catch { /* Ignore damaged journals. */ }
    }
    return logs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30);
  }
  function start(options, key) {
    const started = Date.now();
    const record = {id: randomUUID(), startedAt: new Date(started).toISOString(), status: 'running', model: options.model, size: options.size, method: options.method, request: options, events: []};
    let saved = false;
    // Never record authorization headers; also redact accidental key echoes in provider text.
    const redact = value => JSON.stringify(value).split(key).join('[REDACTED]');
    async function event(stage, details = {}, patch = {}) {
      Object.assign(record, patch, {durationMs: Date.now() - started});
      const entry = {at: new Date().toISOString(), elapsedMs: record.durationMs, stage, ...details};
      record.events.push(entry);
      console.info(`[ollama-designer ${record.id}] ${redact(entry)}`);
      try {
        await mkdir(directory, {recursive: true, mode: 0o700});
        const target = path.join(directory, `${record.id}.json`);
        await writeFile(target + '.tmp', redact(record), {mode: 0o600});
        await rename(target + '.tmp', target);
        saved = true;
      } catch (e) {saved = false; console.error(`[ollama-designer ${record.id}] Journal non enregistré (${e.code || 'erreur disque'}).`);}
    }
    return {id: record.id, event, get saved() {return saved;}};
  }
  return {list, read, start};
}

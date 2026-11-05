import { homedir } from 'os';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = join(homedir(), '.fileforge', 'storage', 'tasks');

export const runtimeStorage = {
  root: ROOT,

  routineDir(routineId) {
    const dir = join(ROOT, routineId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  },

  versionsDir(routineId) {
    const dir = join(this.routineDir(routineId), 'versions');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  },

  runDir(routineId, runId) {
    const dir = join(this.routineDir(routineId), 'runs', runId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  },

  stepsDir(routineId, runId) {
    const dir = join(this.runDir(routineId, runId), 'steps');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  },

  assetsDir(routineId, runId) {
    const dir = join(this.runDir(routineId, runId), 'assets');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  },

  exportsDir(routineId, runId) {
    const dir = join(this.runDir(routineId, runId), 'exports');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  },

  writeJson(path, data) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
    return path;
  },

  readJson(path) {
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  },

  writeAsset(routineId, runId, filename, contents) {
    const dir = this.assetsDir(routineId, runId);
    const path = join(dir, filename);
    if (typeof contents === 'string') writeFileSync(path, contents, 'utf8');
    else writeFileSync(path, contents);
    return path;
  },

  fileSize(path) {
    try { return statSync(path).size; } catch { return null; }
  },

  purgeRun(routineId, runId) {
    const dir = join(this.routineDir(routineId), 'runs', runId);
    rmSync(dir, { recursive: true, force: true });
  },

  purgeRoutine(routineId) {
    const dir = join(ROOT, routineId);
    rmSync(dir, { recursive: true, force: true });
  },

  listRuns(routineId) {
    const dir = join(this.routineDir(routineId), 'runs');
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  },
};

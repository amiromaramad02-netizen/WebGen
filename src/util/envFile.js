import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config.js';

/**
 * Minimal, comment-preserving editor for the project's .env file.
 *
 * Keys pasted through the UI land here so they survive a restart. The file is
 * gitignored, and nothing in this module ever logs a value.
 */

const envPath = () => path.join(config.root, '.env');

function splitLine(line) {
  const eq = line.indexOf('=');
  if (eq === -1) return { key: null, value: line, raw: line };
  return {
    key: line.slice(0, eq).trim(),
    value: line.slice(eq + 1).trim(),
    raw: line,
  };
}

async function readEnv() {
  const raw = await fs.readFile(envPath(), 'utf8').catch(() => null);
  return raw ?? null;
}

export async function envExists() {
  return (await readEnv()) !== null;
}

/** Sets KEY=value, appending the line if the key is not already present. */
export async function setEnvValue(key, value) {
  const existing = await readEnv();
  const trailing = existing === null || existing.endsWith('\n') ? '' : '\n';
  const lines = existing === null ? [] : existing.split(/\r?\n/);

  const at = lines.findIndex((l) => splitLine(l).key === key);
  const next = `${key}=${value}`;
  if (at === -1) {
    // Drop a trailing empty element so we do not leave a blank line behind.
    if (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push(next);
  } else {
    lines[at] = next;
  }
  await fs.writeFile(envPath(), `${lines.join('\n')}\n`, 'utf8');
  return true;
}

/** Removes KEY entirely; reports whether it was there to begin with. */
export async function unsetEnvValue(key) {
  const existing = await readEnv();
  if (existing === null) return false;
  const lines = existing.split(/\r?\n/);
  const kept = lines.filter((l) => splitLine(l).key !== key);
  if (kept.length === lines.length) return false;
  await fs.writeFile(envPath(), `${kept.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
  return true;
}

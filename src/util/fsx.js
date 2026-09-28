import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeFileSafe(absPath, contents) {
  await ensureDir(path.dirname(absPath));
  const tmp = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, contents, 'utf8');
  await fs.rename(tmp, absPath);
  return absPath;
}

export async function readTextIfExists(p) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesRecursive(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(abs, base)));
    } else if (entry.isFile()) {
      out.push(path.relative(base, abs).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

export async function removeDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

export async function dirSize(dir) {
  let total = 0;
  for (const rel of await listFilesRecursive(dir)) {
    try {
      const st = await fs.stat(path.join(dir, rel));
      total += st.size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

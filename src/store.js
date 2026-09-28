import fs from 'node:fs/promises';
import path from 'node:path';
import config from './config.js';
import { log } from './util/logger.js';
import { siteId as newSiteId } from './util/id.js';
import { ensureDir, listFilesRecursive, removeDir } from './util/fsx.js';

const REGISTRY_FILE = path.join(config.paths.sites, '.registry.json');

/**
 * Site registry.
 * Memory is the source of truth for the running process (a site is only usable
 * while its files exist on disk); a small JSON file is written best-effort so a
 * restart does not lose everything, and so the UI can show recent sites.
 */
class SiteStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.sites = new Map();
    this.loaded = false;
  }

  async init() {
    await ensureDir(config.paths.sites);
    try {
      const raw = await fs.readFile(REGISTRY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const entry of parsed.sites ?? []) {
        entry.status = entry.status === 'ready' ? 'stale' : entry.status;
        this.sites.set(entry.id, entry);
      }
      log.debug(`store: restored ${this.sites.size} site record(s) from disk`);
    } catch {
      /* first run */
    }
    this.loaded = true;
    await this.evict();
    return this;
  }

  async persist() {
    try {
      await ensureDir(config.paths.sites);
      const body = JSON.stringify(
        { savedAt: new Date().toISOString(), sites: [...this.sites.values()] },
        null,
        2,
      );
      await fs.writeFile(REGISTRY_FILE, body, 'utf8');
    } catch (err) {
      log.warn('store: persist failed', err.message);
    }
  }

  async create({ brief, options, plan, designSystem, id = newSiteId() }) {
    const record = {
      id,
      brief,
      options,
      plan: plan ?? null,
      designSystem: designSystem ?? null,
      dir: path.join(config.paths.sites, id),
      status: 'generating',
      degraded: false,
      files: [],
      routes: [],
      report: null,
      usage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0, calls: 0, costUsd: 0 },
      events: [],
      deployment: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + config.limits.siteTtlHours * 3600 * 1000,
    };
    await ensureDir(record.dir);
    this.sites.set(id, record);
    await this.evict();
    await this.persist();
    return record;
  }

  get(id) {
    return this.sites.get(id) ?? null;
  }

  async update(id, patch) {
    const record = this.sites.get(id);
    if (!record) return null;
    Object.assign(record, patch, { updatedAt: Date.now() });
    await this.persist();
    return record;
  }

  async syncFiles(id) {
    const record = this.sites.get(id);
    if (!record) return null;
    record.files = await listFilesRecursive(record.dir);
    return record;
  }

  async list({ limit = 20 } = {}) {
    const now = Date.now();
    const alive = [...this.sites.values()].filter((s) => s.expiresAt > now);
    alive.sort((a, b) => b.updatedAt - a.updatedAt);
    return alive.slice(0, limit).map((s) => ({
      id: s.id,
      brief: s.brief,
      status: s.status,
      degraded: s.degraded,
      fileCount: s.files.length,
      routeCount: s.routes.length,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      deployment: s.deployment,
    }));
  }

  /** Removes the oldest expired/excess sites from memory and disk. */
  async evict() {
    const now = Date.now();
    const ordered = [...this.sites.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    const doomed = [];
    for (const s of ordered) {
      if (s.expiresAt <= now) doomed.push(s);
    }
    const overflow = ordered.filter((s) => !doomed.includes(s)).slice(config.limits.maxSitesInMemory);
    const all = [...new Set([...doomed, ...overflow])];
    for (const s of all) {
      this.sites.delete(s.id);
      try {
        await removeDir(s.dir);
      } catch {
        /* ignore */
      }
    }
    if (all.length) {
      log.debug(`store: evicted ${all.length} site(s)`);
      await this.persist();
    }
    return all.length;
  }

  async destroy(id) {
    const record = this.sites.get(id);
    if (!record) return false;
    this.sites.delete(id);
    await removeDir(record.dir);
    await this.persist();
    return true;
  }
}

export const store = new SiteStore();
export default store;

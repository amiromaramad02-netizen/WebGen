import crypto from 'node:crypto';

const ADJECTIVES = [
  'amber', 'bold', 'brave', 'calm', 'clever', 'cosmic', 'craft', 'crisp', 'electric',
  'ember', 'fleet', 'gentle', 'golden', 'hidden', 'lunar', 'lucid', 'noble', 'north',
  'polar', 'prime', 'quiet', 'rapid', 'royal', 'solar', 'swift', 'tidal', 'true', 'vivid',
];
const NOUNS = [
  'anchor', 'atlas', 'badger', 'beacon', 'cedar', 'cipher', 'comet', 'delta', 'ember',
  'falcon', 'forge', 'harbor', 'heron', 'juniper', 'lantern', 'meadow', 'nebula', 'otter',
  'prism', 'quartz', 'ridge', 'signal', 'summit', 'vertex', 'willow',
];

export function randomId(prefix = '') {
  const n = Math.floor(Math.random() * ADJECTIVES.length);
  const m = Math.floor(Math.random() * NOUNS.length);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${prefix}${prefix ? '-' : ''}${ADJECTIVES[n]}-${NOUNS[m]}-${suffix}`;
}

export function siteId() {
  return randomId('site');
}

export function correlationId() {
  return crypto.randomBytes(6).toString('hex');
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function shortHash(input, len = 8) {
  return sha256(input).slice(0, len);
}

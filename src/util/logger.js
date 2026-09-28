import { config, redactSecrets } from '../config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const SILENT = process.env.LOG_LEVEL === 'silent' || process.env.NODE_ENV === 'test';
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

const COLOR = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
const RESET = '\x1b[0m';

function emit(level, args) {
  if (SILENT || LEVELS[level] > threshold) return;
  const safe = args.map((a) => (typeof a === 'string' ? redactSecrets(a) : redactSecrets(inspect(a))));
  const ts = new Date().toISOString().slice(11, 23);
  const tag = `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
  console.log(`${ts} ${tag}`, ...safe);
}

function inspect(value) {
  if (value instanceof Error) return `${value.message}\n${value.stack ?? ''}`;
  try {
    return JSON.stringify(value, replacer, 2);
  } catch {
    return String(value);
  }
}

function replacer(_key, value) {
  if (value instanceof Error) return { message: value.message, code: value.code };
  if (typeof value === 'string' && value.length > 2000) return value.slice(0, 2000) + `…(+${value.length - 2000})`;
  return value;
}

const levelFn = (level) => (...args) => emit(level, args);

export const log = {
  error: levelFn('error'),
  warn: levelFn('warn'),
  info: levelFn('info'),
  debug: levelFn('debug'),
  success: levelFn('info'),
  child(prefix) {
    const wrap = (lvl) => (...args) => emit(lvl, [`[${prefix}]`, ...args]);
    return {
      error: wrap('error'),
      warn: wrap('warn'),
      info: wrap('info'),
      debug: wrap('debug'),
      success: wrap('info'),
    };
  },
};

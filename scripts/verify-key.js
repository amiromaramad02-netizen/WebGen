#!/usr/bin/env node
/**
 * Checks that GEMINI_API_KEY actually works, before you spend a generation on it.
 *
 *   npm run verify:key
 *
 * Never prints the key. Reports the model that answered, the round trip, and
 * whether the account is being rate limited or blocked.
 */
import { gemini } from '../src/gemini/client.js';
import { hasApiKey, providerMode, redactSecrets } from '../src/config.js';

const argv = new Set(process.argv.slice(2));
const json = argv.has('--json');

function line(label, value) {
  if (json) return;
  process.stdout.write(`  ${label.padEnd(14)} ${value}\n`);
}

async function main() {
  if (!hasApiKey()) {
    const result = { ok: false, mode: providerMode(), message: 'GEMINI_API_KEY is missing. Copy .env.example to .env and add your key.' };
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stderr.write(`Key check failed: ${result.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (!json) {
    process.stdout.write('Checking your Gemini key...\n');
    line('provider', providerMode());
  }

  const started = Date.now();
  const result = await gemini.verify();
  const ms = Date.now() - started;

  if (json) {
    process.stdout.write(`${JSON.stringify({ ...result, latencyMs: ms }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`  ${result.message}\n`);
    line('latency', `${ms}ms`);
  } else {
    process.stderr.write(`${redactSecrets(result.message)}\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`${redactSecrets(String(err?.message ?? err))}\n`);
  process.exitCode = 1;
});

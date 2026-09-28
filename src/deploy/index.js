import config from '../config.js';
import { log } from '../util/logger.js';
import { inventory, hostManifests } from '../pipeline/bundle.js';
import { slugify } from '../util/text.js';

const PROVIDERS = ['cloudflare', 'netlify', 'github'];

/** Which provider can actually run right now, and what is missing. */
export function deployReadiness() {
  const out = {};
  for (const provider of PROVIDERS) out[provider] = { ready: false, missing: [] };

  if (config.deploy.cloudflare.apiToken && config.deploy.cloudflare.accountId) {
    out.cloudflare.ready = true;
  } else {
    out.cloudflare.missing = [
      !config.deploy.cloudflare.accountId ? 'CLOUDFLARE_ACCOUNT_ID' : null,
      !config.deploy.cloudflare.apiToken ? 'CLOUDFLARE_API_TOKEN (Pages:Edit)' : null,
    ].filter(Boolean);
  }

  if (config.deploy.netlify.authToken) {
    out.netlify.ready = true;
  } else {
    out.netlify.missing = ['NETLIFY_AUTH_TOKEN'];
  }

  if (config.deploy.github.token && config.deploy.github.repo) {
    out.github.ready = true;
  } else {
    out.github.missing = [!config.deploy.github.token ? 'GITHUB_TOKEN' : null, !config.deploy.github.repo ? 'GITHUB_REPO (owner/name)' : null].filter(Boolean);
  }
  return out;
}

export async function deploySite({ siteId, siteDir, plan, provider = config.deploy.provider, projectName }) {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    return {
      ok: false,
      provider,
      reason: 'unknown-provider',
      message: `Unknown provider "${provider}". Choose one of: ${PROVIDERS.join(', ')}.`,
    };
  }
  const readiness = deployReadiness()[provider];
  if (!readiness.ready) {
    return {
      ok: false,
      provider,
      reason: 'not-configured',
      missing: readiness.missing,
      instructions: fallbackInstructions(provider, plan, projectName),
      message: `${provider} is not configured. Missing: ${readiness.missing.join(', ')}. Use the one-command instructions below, or add the credentials and retry.`,
    };
  }
  try {
    const result = await adapter.deploy({ siteDir, plan, projectName });
    log.success(`deployed ${siteId} to ${provider}: ${result.url}`);
    return { ok: true, provider, ...result };
  } catch (err) {
    log.warn(`deploy to ${provider} failed:`, err.message);
    return {
      ok: false,
      provider,
      reason: 'provider-error',
      message: `${provider} rejected the upload: ${err.message}`,
      instructions: fallbackInstructions(provider, plan, projectName),
    };
  }
}

function projectNameFor(plan, projectName) {
  return slugify(projectName || plan?.brandName || 'webgen-site').slice(0, 40) || 'webgen-site';
}

function fallbackInstructions(provider, plan, projectName) {
  const name = projectNameFor(plan, projectName);
  const common = `# One-file deploy for ${name} (no build step, no framework)\n\n# 1. cd into the unzipped site folder\n# 2. deploy:\n`;
  const byProvider = {
    cloudflare: `${common}npx wrangler pages deploy . --project-name=${name}\n\n# or link this folder to an existing Pages project:\nnpx wrangler pages project create ${name}\n`,
    netlify: `${common}npx netlify deploy --prod --dir=. --site=<your-site-id>\n\n# or create the site first:\nnpx netlify sites:create --name=${name}\n`,
    github: `${common}git init && git add -A && git commit -m "Deploy ${name}"\ngit branch -M main\ngit remote add origin https://github.com/<owner>/<repo>.git\ngit push -u origin main\n\n# then: Settings -> Pages -> Source: GitHub Actions (the workflow file is already in the bundle)\n`,
  };
  return byProvider[provider] ?? common;
}

/* ------------------------------------------------------------- cloudflare */

const cloudflare = {
  name: 'cloudflare',
  label: 'Cloudflare Pages',
  async deploy({ siteDir, plan, projectName }) {
    const name = projectNameFor(plan, projectName);
    const account = config.deploy.cloudflare.accountId;
    const token = config.deploy.cloudflare.apiToken;
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects`;

    const projectRes = await fetch(`${base}/${name}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let projectId;
    if (projectRes.ok) {
      projectId = (await projectRes.json()).result?.id;
    } else {
      const createRes = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, production_branch: 'main' }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok) throw new Error(createBody?.errors?.[0]?.message ?? `project create failed (${createRes.status})`);
      projectId = createBody.result?.id;
    }
    if (!projectId) throw new Error('could not resolve a Pages project id');

    const form = new FormData();
    const files = await inventory(siteDir);
    const manifest = hostManifests(name);
    for (const rel of files) {
      const abs = `${siteDir}/${rel.path}`;
      form.append('file', new Blob([await (await import('node:fs/promises')).readFile(abs)], { type: contentType(rel.path) }), rel.path);
    }
    for (const [rel, body] of Object.entries(manifest)) {
      form.append('file', new Blob([body], { type: 'text/plain' }), rel);
    }

    const uploadRes = await fetch(`${base}/${name}/deployments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploadBody = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(uploadBody?.errors?.[0]?.message ?? `upload failed (${uploadRes.status})`);
    }
    return {
      url: uploadBody.result?.url ?? `https://${name}.pages.dev`,
      deploymentId: uploadBody.result?.id,
      adapter: 'cloudflare-pages-direct-upload',
    };
  },
};

function contentType(path) {
  const map = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
  };
  return map[path.slice(path.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';
}

/* ---------------------------------------------------------------- netlify */

const netlify = {
  name: 'netlify',
  label: 'Netlify',
  async deploy({ siteDir, plan, projectName }) {
    const token = config.deploy.netlify.authToken;
    let siteId = config.deploy.netlify.siteId;

    if (!siteId) {
      const createRes = await fetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectNameFor(plan, projectName) }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok) throw new Error(createBody?.message ?? 'site create failed');
      siteId = createBody.id;
    }

    const manifest = JSON.stringify(hostManifests(projectNameFor(plan, projectName)));
    const files = await inventory(siteDir);
    const digest = await (await import('node:crypto')).createHash('sha1').update(plan?.brandName ?? name).digest('hex');

    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: Object.fromEntries(files.map((f) => [f.path, null])),
        manifest,
        async: false,
        skip_cleanup: false,
      }),
    });
    const deployBody = await deployRes.json();
    if (!deployRes.ok) throw new Error(deployBody?.message ?? `deploy failed (${deployRes.status})`);
    void digest;
    return {
      url: deployBody.deploy_ssl_url ?? deployBody.ssl_url ?? `https://${deployBody.name}.netlify.app`,
      deploymentId: deployBody.id,
      siteId,
      adapter: 'netlify-api',
      note: 'Files are declared in the manifest; upload them with `netlify deploy --dir=.` for byte-exact content.',
    };
  },
};

/* --------------------------------------------------------- github actions */

const github = {
  name: 'github',
  label: 'GitHub Pages',
  async deploy({ siteDir, plan, projectName }) {
    const token = config.deploy.github.token;
    const [owner, repo] = config.deploy.github.repo.split('/');
    if (!owner || !repo) throw new Error('GITHUB_REPO must be "owner/repo"');
    const api = `https://api.github.com/repos/${owner}/${repo}/contents`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const files = await inventory(siteDir);
    const manifest = hostManifests(projectNameFor(plan, projectName));
    const all = [...files, ...Object.entries(manifest).map(([path]) => ({ path }))];
    const branch = 'main';

    for (const f of all) {
      const body = f.bytes !== undefined ? (await import('node:fs/promises')).then((fs) => fs.readFile(`${siteDir}/${f.path}`)) : Buffer.from(manifest[f.path] ?? '');
      const content = Buffer.isBuffer(body) ? body : await body;
      const existing = await fetch(`${api}/${f.path}?ref=${branch}`, { headers });
      const sha = existing.ok ? (await existing.json()).sha : null;
      const res = await fetch(`${api}/${f.path}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: JSON.stringify({
          message: `Deploy ${f.path} via WebGen`,
          content: content.toString('base64'),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`${f.path}: ${err.message ?? res.status}`);
      }
    }

    return {
      url: `https://${owner}.github.io/${repo}/`,
      deploymentId: branch,
      adapter: 'github-pages-contents-api',
      note: 'Enable Settings -> Pages -> Source: GitHub Actions. The workflow file was pushed with the site.',
    };
  },
};

export const ADAPTERS = { cloudflare, netlify, github };
export const PROVIDER_LIST = PROVIDERS;
export const fallbackInstructionsFor = fallbackInstructions;

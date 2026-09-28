/**
 * Fixture generator: a real, working, template-driven website.
 *
 * Two jobs:
 *  1. It backs the mock provider so the entire pipeline can be built, run and
 *     tested end-to-end with no API key (the real pipeline, not a stub).
 *  2. It is the reference implementation of the design skill system — the CSS
 *     here is what the prompt bank asks Gemini to produce.
 */
import { normaliseTokens, buildCssVars } from '../design/tokens.js';
import { escapeHtml, slugify, titleCase } from '../util/text.js';

/* ------------------------------------------------------------------ triage */

const INDUSTRY_WORDS = [
  'coffee', 'saas', 'agency', 'restaurant', 'fitness', 'fintech', 'healthcare', 'education',
  'real estate', 'travel', 'photography', 'consulting', 'ecommerce', 'gaming', 'music',
  'sustainability', 'legal', 'construction', 'pet care', 'education platform',
];

export function inferBrief(brief) {
  const text = String(brief ?? '').trim();
  const lower = text.toLowerCase();
  const industry =
    INDUSTRY_WORDS.find((w) => lower.includes(w)) ?? /software|app|platform|tool|api/i.test(lower) ? 'software' : 'services';

  const quoted = text.match(/["“']([^"”']{2,40})["”']/);
  const calledMatch = text.match(/\bcalled\s+([A-Za-z0-9&' -]{2,40})/i);
  const forMatch = text.match(/\bfor\s+(?:a|an|the)\s+([a-z ]{3,40})/i);
  const brandName = titleCase(
    (quoted?.[1] ?? calledMatch?.[1] ?? forMatch?.[1] ?? `${titleCase(industry)} ${pickSuffix(industry)}`).trim(),
  ).slice(0, 28);

  const archetype = /portfolio|personal|resume/i.test(lower)
    ? 'minimal-luxury'
    : /dashboard|analytics|admin/i.test(lower)
      ? 'dashboard-dense'
      : /blog|magazine|journal|news/i.test(lower)
        ? 'editorial-magazine'
        : /store|shop|ecommerce|product/i.test(lower)
          ? 'neo-brutal'
          : /luxury|premium|elegant/i.test(lower)
            ? 'minimal-luxury'
            : 'landing-conversion';

  const isMulti = /multi-?page|(\d+)\s*pages|website with pages/i.test(lower);
  const numPages = Number(lower.match(/(\d+)\s*pages?/)?.[1] ?? 0);

  return {
    pageType: archetype === 'dashboard-dense' ? 'saas-app' : isMulti ? 'multipage' : 'landing',
    industry,
    brandName,
    mood: moodFor(lower),
    archetype,
    audience: audienceFor(industry),
    valueProp: `The fastest way for ${audienceFor(industry).toLowerCase()} to get a better result this quarter.`,
    mustHaveSections: sectionsFor(lower, archetype),
    pages: buildPageList(archetype, isMulti, numPages),
    callouts: [
      'Invent a specific, credible brand voice and keep it consistent.',
      'No stock photography: use CSS and inline SVG art only.',
      'Every claim on the page must be plausible and specific, never vague superlatives.',
      'The primary CTA must be a real link or a real working form.',
    ],
    risks: ['Imagery must be generated, not downloaded', 'Interactions must work without any network call'],
  };
}

function pickSuffix(industry) {
  const map = {
    coffee: 'Collective', software: 'Labs', agency: 'Studio', restaurant: 'Kitchen',
    fitness: 'Athletic', fintech: 'Capital', healthcare: 'Health', education: 'Academy',
    'real estate': 'Properties', travel: 'Journeys', photography: 'Studio',
    consulting: 'Partners', ecommerce: 'Supply', gaming: 'Arcade', music: 'Sound',
    sustainability: 'Works', legal: 'Counsel', construction: 'Build', 'pet care': 'Paws',
    'education platform': 'Learn',
  };
  return map[industry] ?? 'Collective';
}

function moodFor(lower) {
  if (/dark|moody|night/.test(lower)) return 'moody, warm, nocturnal';
  if (/luxury|premium|elegant/.test(lower)) return 'refined, quiet, expensive';
  if (/playful|fun|colourful|colorful/.test(lower)) return 'bright, playful, optimistic';
  if (/tech|ai|saas|developer/.test(lower)) return 'precise, technical, confident';
  if (/minimal|clean/.test(lower)) return 'restrained, calm, deliberate';
  return 'warm, confident, human';
}

function audienceFor(industry) {
  const map = {
    coffee: 'independent coffee shops and their regulars',
    software: 'engineering teams that ship fast',
    agency: 'founders who need a design partner',
    restaurant: 'neighbourhood diners looking for a good table',
    fitness: 'people training for their first unassisted pull-up',
    fintech: 'finance teams tired of manual reconciliation',
    healthcare: 'clinicians who chose their profession to help people',
    education: 'students who want to actually understand the material',
    'real estate': 'buyers who are tired of being shown houses that sold',
    travel: 'travellers who would rather spend their time there',
    photography: 'photographers who shoot more than they edit',
    consulting: 'operations leads who inherited a mess',
    ecommerce: 'shoppers who read the return policy first',
    gaming: 'players who finish games in one sitting',
    music: 'artists who want their sound to land',
    sustainability: 'teams with a real carbon target',
    legal: 'small firms competing against large ones',
    construction: 'developers who need certainty before they pour concrete',
    'pet care': 'people who would cancel a trip before leaving a dog alone',
    'education platform': 'teachers with 30 students and no time',
  };
  return map[industry] ?? 'busy people who want a better outcome';
}

function sectionsFor(lower, archetype) {
  const base = ['hero', 'logo-marquee', 'features', 'stats', 'testimonials', 'faq', 'cta-band'];
  if (/pricing|shop|store|subscribe|saas/.test(lower)) return ['hero', 'logo-marquee', 'features', 'pricing', 'stats', 'testimonials', 'faq', 'cta-band'];
  if (archetype === 'editorial-magazine') return ['hero', 'showcase', 'timeline', 'testimonials', 'newsletter', 'cta-band'];
  if (archetype === 'dashboard-dense') return ['hero', 'stats', 'table', 'tabs', 'features', 'faq'];
  if (archetype === 'minimal-luxury') return ['hero', 'showcase', 'features', 'testimonials', 'contact', 'cta-band'];
  if (/portfolio/.test(lower)) return ['hero', 'showcase', 'stats', 'timeline', 'testimonials', 'contact'];
  return base;
}

function buildPageList(archetype, isMulti, numPages) {
  if (!isMulti && numPages < 2) return ['index.html'];
  const pages = ['index.html'];
  if (numPages >= 2 || /about/i.test(archetype)) pages.push('about.html');
  if (numPages >= 3) pages.push('work.html');
  if (numPages >= 4) pages.push('pricing.html');
  else if (/pricing|shop|store|subscribe/i.test(String(archetype))) pages.push('pricing.html');
  else pages.push('contact.html');
  return [...new Set(pages)];
}

/* -------------------------------------------------------------------- plan */

export function buildPlan(triage, options = {}) {
  const brand = options.brandName || triage.brandName;
  const pages = options.pages?.length ? options.pages : triage.pages;
  const tagline = taglineFor(brand, triage);

  const files = [];
  for (const p of pages) {
    const sections = p === 'index.html' ? triage.mustHaveSections : interiorSections(p);
    files.push({
      path: p,
      kind: 'page',
      page: p,
      description: `The ${p === 'index.html' ? 'home page' : slugify(p.replace('.html', '')) + ' page'}: ${sections.join(', then ')}.`,
    });
  }
  files.push({ path: 'styles.css', kind: 'style', page: 'shared', description: 'The one stylesheet: tokens, reset, typography, layout, every component, dark mode, reduced motion.' });
  files.push({ path: 'app.js', kind: 'script', page: 'shared', description: 'The one script: smart nav, drawer with focus trap, scroll reveal, count-up, FAQ, forms, tabs, modal, theme toggle, back-to-top.' });
  files.push({ path: 'favicon.svg', kind: 'asset', page: 'shared', description: 'A hand-written SVG mark built from the brand initials.' });
  files.push({ path: 'og-image.svg', kind: 'asset', page: 'shared', description: 'A 1200x630 social card with the brand name and tagline.' });
  files.push({ path: 'robots.txt', kind: 'seo', page: 'shared', description: 'Allow everything and point at the sitemap.' });
  files.push({ path: 'sitemap.xml', kind: 'seo', page: 'shared', description: 'One <url> per page, absolute URLs.' });
  files.push({ path: 'site.webmanifest', kind: 'meta', page: 'shared', description: 'name, short_name, start_url, display standalone, theme and background colours from the palette.' });

  return {
    brandName: brand,
    tagline,
    summary: `A complete static site for ${brand}: ${triage.valueProp} Designed for ${triage.audience}.`,
    audience: triage.audience,
    toneOfVoice: triage.mood,
    pages: pages.map((p) => ({
      path: p,
      title: p === 'index.html' ? `${brand} — ${tagline}` : `${titleCase(p.replace('.html', ''))} — ${brand}`,
      purpose:
        p === 'index.html'
          ? `Make the visitor understand ${brand} in fifteen seconds and act.`
          : `Give a visitor who is already interested the detail they need about ${slugify(p.replace('.html', ''))}.`,
      sections: p === 'index.html' ? triage.mustHaveSections : interiorSections(p),
      primaryCta: p === 'index.html' ? 'Start free' : 'Talk to us',
    })),
    files,
    sections: triage.mustHaveSections.map((s) => ({ slug: s, heading: headingFor(s, brand), purpose: purposeFor(s) })),
    seo: {
      metaDescription: `${brand} — ${tagline} Built for ${triage.audience}.`,
      keywords: [slugify(brand), slugify(triage.industry), slugify(triage.pageType), 'quality', 'reliable', slugify(triage.mood.split(',')[0])],
      ogTitle: `${brand} — ${tagline}`,
      ogDescription: `Built for ${triage.audience}.`,
      jsonLdType: /saas|software|platform|tool/i.test(triage.industry) ? 'SoftwareApplication' : /shop|store|product|coffee|restaurant/i.test(triage.industry) ? 'LocalBusiness' : 'Organization',
    },
    accessibilityNotes: [
      'One h1 per page, no skipped heading levels.',
      'Drawer traps focus and restores it on close.',
      'Every FAQ answer is reachable by keyboard and readable by screen reader.',
    ],
  };
}

function taglineFor(brand, triage) {
  const map = {
    coffee: 'Coffee roasted the day it ships',
    software: 'Ship the thing, not the ceremony',
    agency: 'Design that pulls its weight',
    restaurant: 'A short menu, cooked properly',
    fitness: 'Stronger in twelve focused weeks',
    fintech: 'The month-end close, minus the dread',
    healthcare: 'Care that fits in a normal week',
    education: 'Understand it once, properly',
    'real estate': 'Houses that are actually worth seeing',
    travel: 'Fewer airports, more places',
    photography: 'Finish the edit, start the next shoot',
    consulting: 'Operations that run without you',
    ecommerce: 'Good things, honestly described',
    gaming: 'One more run, then sleep',
    music: 'Sound that survives the mix',
    sustainability: 'Cut the number that matters',
    legal: 'Small firm work, large firm rigour',
    construction: 'Certainty before the pour',
    'pet care': 'Somewhere they would actually stay',
    'education platform': 'Lessons that respect your evening',
  };
  return map[triage.industry] ?? `${brand} does the thing properly`;
}

function interiorSections(page) {
  if (/about/.test(page)) return ['hero', 'timeline', 'team', 'values', 'cta-band'];
  if (/work|portfolio|projects/.test(page)) return ['hero', 'showcase', 'case-study', 'stats', 'cta-band'];
  if (/pricing/.test(page)) return ['hero', 'pricing', 'faq', 'cta-band'];
  if (/contact/.test(page)) return ['hero', 'contact', 'faq'];
  return ['hero', 'features', 'faq', 'cta-band'];
}

function headingFor(slug, brand) {
  const map = {
    hero: `${brand}, without the busywork`,
    'logo-marquee': `Teams already shipping with ${brand}`,
    features: 'Everything you need, nothing you do not',
    stats: 'The numbers that matter',
    testimonials: 'What people say when we are not in the room',
    pricing: 'Pricing you can predict',
    faq: 'Questions worth answering',
    'cta-band': 'Ready when you are',
    problem: 'The part that wastes your week',
    solution: 'What changes',
    'how-it-works': 'Three steps, then it is done',
    showcase: 'Recent work',
    'case-study': 'One project, in detail',
    timeline: 'How we got here',
    team: 'Who you will actually work with',
    contact: 'Say hello',
    newsletter: 'One email a month, useful ones only',
    table: 'Everything in one place',
    tabs: 'Pick your view',
  };
  return map[slug] ?? titleCase(slug.replace(/-/g, ' '));
}

function purposeFor(slug) {
  const map = {
    hero: 'Answer what this is and who it is for above the fold.',
    'logo-marquee': 'Borrow credibility from names that are already trusted.',
    features: 'Make the three real capabilities concrete.',
    stats: 'Give scale without hype.',
    testimonials: 'Specific outcomes from specific people.',
    pricing: 'Remove the pricing anxiety.',
    faq: 'Objection handling.',
    'cta-band': 'One last, low-friction ask.',
  };
  return map[slug] ?? 'Support the page narrative.';
}

/* ------------------------------------------------------------------ design */

export function buildDesign(triage, plan) {
  const brand = plan.brandName;
  const presets = {
    coffee: { primary: '#7c4a2d', accent: '#d97706', background: '#fdfaf6', surface: '#f6ece1', text: '#2b1d14', mood: 'roasted, warm, unhurried' },
    software: { primary: '#4338ca', accent: '#06b6d4', background: '#ffffff', surface: '#f5f6ff', text: '#0d0d1f', mood: 'precise, technical, calm' },
    agency: { primary: '#111827', accent: '#f43f5e', background: '#ffffff', surface: '#f6f6f7', text: '#111111', mood: 'confident, editorial, sharp' },
    restaurant: { primary: '#9f1239', accent: '#f59e0b', background: '#fffdfa', surface: '#fdf1ee', text: '#2b0d12', mood: 'warm, generous, evening' },
    fitness: { primary: '#065f46', accent: '#f97316', background: '#ffffff', surface: '#f0fdf4', text: '#05231a', mood: 'energetic, disciplined, clean' },
    fintech: { primary: '#0f172a', accent: '#0ea5e9', background: '#ffffff', surface: '#f1f5f9', text: '#0b1220', mood: 'exact, trustworthy, dense' },
    healthcare: { primary: '#0e7490', accent: '#14b8a6', background: '#ffffff', surface: '#f0f9fb', text: '#0a2a33', mood: 'calm, clinical, kind' },
    education: { primary: '#4f46e5', accent: '#f59e0b', background: '#ffffff', surface: '#eef2ff', text: '#16134a', mood: 'encouraging, clear, bright' },
    'real estate': { primary: '#1e3a5f', accent: '#b08968', background: '#ffffff', surface: '#f2f5f8', text: '#0f1a26', mood: 'quiet, expensive, calm' },
    travel: { primary: '#0d9488', accent: '#f97316', background: '#ffffff', surface: '#f0fdfa', text: '#0b2b28', mood: 'open, sunny, unhurried' },
    photography: { primary: '#18181b', accent: '#e11d48', background: '#0a0a0a', surface: '#18181b', text: '#fafafa', mood: 'dark, filmic, still' },
    consulting: { primary: '#1e40af', accent: '#0f766e', background: '#ffffff', surface: '#eef2ff', text: '#0b1220', mood: 'structured, senior, plain' },
    ecommerce: { primary: '#b91c1c', accent: '#111827', background: '#ffffff', surface: '#f8f8f8', text: '#111111', mood: 'punchy, direct, commercial' },
    gaming: { primary: '#7c3aed', accent: '#22d3ee', background: '#09090b', surface: '#18181b', text: '#fafafa', mood: 'electric, fast, loud' },
    music: { primary: '#db2777', accent: '#8b5cf6', background: '#0a0a0a', surface: '#171717', text: '#fafafa', mood: 'loud, saturated, late-night' },
    sustainability: { primary: '#15803d', accent: '#a3e635', background: '#ffffff', surface: '#f0fdf4', text: '#052e16', mood: 'clear, honest, fresh' },
    legal: { primary: '#1e293b', accent: '#b45309', background: '#ffffff', surface: '#f8fafc', text: '#0f172a', mood: 'plainspoken, careful, exact' },
    construction: { primary: '#a16207', accent: '#1f2937', background: '#ffffff', surface: '#fefce8', text: '#1c1917', mood: 'solid, grounded, direct' },
    'pet care': { primary: '#c2410c', accent: '#16a34a', background: '#fffdf8', surface: '#fff7ed', text: '#2b1a0d', mood: 'kind, warm, unhurried' },
  };
  const base = presets[triage.industry] ?? {
    primary: '#1d4ed8', accent: '#f97316', background: '#ffffff', surface: '#f8fafc', text: '#0f172a',
  };
  const isDark = triage.mood.includes('dark') || /dark|moody|night/.test(triage.mood);

  return {
    archetype: triage.archetype,
    skills: [],
    mood: triage.mood,
    palette: {
      seed: `${triage.industry} — ${triage.mood}`,
      primary: base.primary,
      primaryDark: base.primary,
      primarySoft: base.surface,
      accent: base.accent,
      accent2: base.primary,
      background: base.background,
      surface: base.surface,
      surfaceAlt: base.surface,
      text: base.text,
      textMuted: base.text,
      border: base.text,
      success: '#15803d',
      warning: '#b45309',
      danger: '#b91c1c',
      darkBackground: '#0b1220',
      darkSurface: '#131c2e',
      darkText: '#e8edf6',
    },
    typography: {
      display: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
      body: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      displayWeight: 800,
      bodyWeight: 400,
      displayTracking: '-0.03em',
      scale: 1.25,
      baseSize: 17,
      lineHeight: 1.65,
      measure: '68ch',
    },
    space: {
      base: 8,
      sectionY: 'clamp(64px, 8vw, 120px)',
      sectionYMobile: 'clamp(48px, 12vw, 72px)',
      gutter: 'clamp(20px, 5vw, 48px)',
      containerMax: '1200px',
    },
    shape: { radiusScale: [0, 6, 12, 20, 999], borderWidth: ['1px'], elevation: [] },
    motion: {
      duration: '180ms',
      easing: 'cubic-bezier(.2,.8,.2,1)',
      techniques: ['micro-interactions', 'hover-lift', 'scroll-reveal'],
      reducedMotionStrategy: '',
    },
    cssVars: '',
    rationale: `${brand} needed to read as trustworthy before it read as clever, so the palette is ${isDark ? 'dark and high-contrast' : 'restrained with a single decisive accent'} and the type does the persuading.`,
  };
}

/* -------------------------------------------------------------- file bodies */

export function buildStyles(plan, design) {
  const tokens = normaliseTokens(design);
  const root = buildCssVars(tokens);
  const p = tokens.palette;
  const dark = p.darkBackground;

  return `${root}

/* ---------- reset ---------- */
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body,h1,h2,h3,h4,h5,h6,p,figure,blockquote,dl,dd,ul,ol{margin:0}
ul[class],ol[class]{list-style:none;padding:0}
img,svg,video,canvas{display:block;max-width:100%;height:auto}
button,input,select,textarea{font:inherit;color:inherit}
button{background:none;border:0;cursor:pointer}
a{color:inherit;text-decoration:none}
table{border-collapse:collapse;width:100%}
:where(h1,h2,h3,h4){text-wrap:balance}
:where(p,li){text-wrap:pretty}

/* ---------- base ---------- */
html{scroll-behavior:smooth;scroll-padding-top:96px}
body{background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:var(--step-0);line-height:var(--leading-body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
body.is-locked{overflow:hidden}
::selection{background:var(--primary);color:var(--on-primary)}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:var(--radius-1)}
.skip-link{position:absolute;left:var(--space-4);top:-100px;z-index:100;background:var(--primary);color:var(--on-primary);padding:var(--space-3) var(--space-4);border-radius:var(--radius-2);transition:top var(--dur) var(--ease)}
.skip-link:focus{top:var(--space-4)}

/* ---------- typography ---------- */
h1,h2,h3,h4{font-family:var(--font-display);font-weight:var(--weight-display);letter-spacing:var(--tracking-display);line-height:1.08;margin:0}
h1{font-size:var(--step-5)}
h2{font-size:var(--step-3)}
h3{font-size:var(--step-1)}
h4{font-size:var(--step-0)}
p{max-width:var(--measure)}
.eyebrow{font-family:var(--font-mono);font-size:0.75rem;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-muted);font-weight:600}
.lede{font-size:var(--step-1);line-height:1.5;color:var(--text-muted);max-width:56ch}
.prose{max-width:var(--measure)}
.prose p + p{margin-top:var(--space-4)}
.muted{color:var(--text-muted)}

/* ---------- layout ---------- */
.container{width:100%;max-width:var(--container-max);margin-inline:auto;padding-inline:var(--gutter)}
.section{padding-block:var(--section-y-mobile)}
@media (min-width:640px){.section{padding-block:var(--section-y)}}
.section--tight{padding-block:calc(var(--section-y-mobile)/1.6)}
.section--alt{background:var(--surface)}
.grid{display:grid;gap:var(--space-5)}
.stack{display:flex;flex-direction:column;gap:var(--space-4)}
.cluster{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-3)}
.split{display:grid;gap:var(--space-6);align-items:center}
@media (min-width:900px){.split{grid-template-columns:1.4fr 1fr}.split--wide{grid-template-columns:1.6fr 1fr}}
.grid-2,.grid-3,.grid-4{display:grid;gap:var(--space-5)}
@media (min-width:640px){.grid-2,.grid-3,.grid-4{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1000px){.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}}
.divider{height:1px;background:var(--border);border:0;margin:0}
.icon{width:24px;height:24px;flex:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}

/* ---------- buttons ---------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);min-height:44px;padding:0 var(--space-5);border-radius:var(--radius-pill);font-weight:600;font-size:var(--step-0);border:var(--border-w) solid transparent;transition:transform var(--dur) var(--ease),background var(--dur) var(--ease),color var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}
.btn:hover{transform:translateY(-2px)}
.btn:active{transform:translateY(0)}
.btn-primary{background:var(--primary);color:var(--on-primary);box-shadow:var(--shadow-1)}
.btn-primary:hover{background:var(--primary-dark)}
.btn-secondary{background:transparent;color:var(--text);border-color:var(--border)}
.btn-secondary:hover{border-color:var(--primary);color:var(--primary)}
.btn-ghost{background:transparent;color:var(--primary);padding-inline:var(--space-2)}
.btn-lg{min-height:52px;padding-inline:var(--space-6);font-size:var(--step-1)}
.text-link{color:var(--primary);font-weight:600;border-bottom:1px solid transparent}
.text-link:hover{border-bottom-color:currentColor}

/* ---------- header / nav ---------- */
.site-header{position:sticky;top:0;z-index:50;background:transparent;transition:background var(--dur) var(--ease),box-shadow var(--dur) var(--ease),border-color var(--dur) var(--ease);border-bottom:1px solid transparent}
.site-header.is-scrolled{background:color-mix(in oklab,var(--bg) 88%,transparent);backdrop-filter:blur(12px) saturate(140%);-webkit-backdrop-filter:blur(12px) saturate(140%);border-bottom-color:var(--border)}
.site-header__inner{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);min-height:72px}
.brand{display:flex;align-items:center;gap:var(--space-3);font-family:var(--font-display);font-weight:var(--weight-display);font-size:var(--step-1);letter-spacing:var(--tracking-display)}
.brand__mark{width:34px;height:34px;flex:none;border-radius:var(--radius-2);background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-size:0.95rem;font-weight:800}
.nav-desktop{display:none;align-items:center;gap:var(--space-5)}
@media (min-width:900px){.nav-desktop{display:flex}.nav-toggle{display:none}.mobile-nav{display:none}}
.nav-link{position:relative;color:var(--text-muted);font-weight:500;padding:var(--space-2) 0}
.nav-link::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:2px;background:var(--primary);transform:scaleX(0);transform-origin:left;transition:transform var(--dur) var(--ease)}
.nav-link:hover,.nav-link.is-active{color:var(--text)}
.nav-link.is-active::after,.nav-link:hover::after{transform:scaleX(1)}
.nav-toggle{width:44px;height:44px;display:grid;place-items:center;border-radius:var(--radius-2)}
.nav-toggle span{display:block;width:20px;height:2px;background:var(--text);position:relative;transition:transform var(--dur) var(--ease)}
.nav-toggle span::before,.nav-toggle span::after{content:"";position:absolute;left:0;width:20px;height:2px;background:var(--text);transition:transform var(--dur) var(--ease),opacity var(--dur) var(--ease)}
.nav-toggle span::before{top:-6px}
.nav-toggle span::after{top:6px}
.nav-toggle[aria-expanded="true"] span{transform:rotate(45deg)}
.nav-toggle[aria-expanded="true"] span::before{transform:translateY(6px) rotate(-90deg)}
.nav-toggle[aria-expanded="true"] span::after{opacity:0}
.mobile-nav{position:fixed;inset:0 0 0 auto;width:min(88vw,360px);background:var(--bg);border-left:1px solid var(--border);padding:var(--space-6) var(--space-5);display:flex;flex-direction:column;gap:var(--space-4);transform:translateX(100%);visibility:hidden;transition:transform 260ms var(--ease),visibility 260ms}
.mobile-nav.is-open{transform:translateX(0);visibility:visible}
.mobile-nav a{padding:var(--space-3) 0;font-size:var(--step-1);font-weight:600;border-bottom:1px solid var(--border)}
.nav-backdrop{position:fixed;inset:0;background:rgb(0 0 0 / 0.45);opacity:0;visibility:hidden;transition:opacity 240ms var(--ease),visibility 240ms;z-index:40}
.nav-backdrop.is-open{opacity:1;visibility:visible}
@media (min-width:900px){.nav-backdrop{display:none}}

/* ---------- hero ---------- */
.hero{position:relative;overflow:hidden;padding-block:var(--section-y-mobile)}
.hero__grid{display:grid;gap:var(--space-7);align-items:center}
@media (min-width:900px){.hero__grid{grid-template-columns:1.25fr 1fr}}
.hero h1{margin-block:var(--space-3) var(--space-4)}
.hero h1 em{font-style:normal;color:var(--accent)}
.hero__actions{display:flex;flex-wrap:wrap;gap:var(--space-3);margin-top:var(--space-5)}
.trust-row{display:flex;flex-wrap:wrap;gap:var(--space-5);margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--border)}
.trust-row div{display:flex;flex-direction:column}
.trust-row strong{font-family:var(--font-display);font-size:var(--step-1);line-height:1.1}
.trust-row span{font-size:0.85rem;color:var(--text-muted)}
.hero-art{position:relative;aspect-ratio:4/3;border-radius:var(--radius-4);overflow:hidden;background:
  radial-gradient(120% 90% at 15% 10%, color-mix(in oklab,var(--primary) 85%,transparent) 0%, transparent 55%),
  radial-gradient(90% 80% at 90% 80%, color-mix(in oklab,var(--accent) 70%,transparent) 0%, transparent 60%),
  var(--surface);}
.hero-art::after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle at 1px 1px,rgb(0 0 0 / 0.12) 1px,transparent 0);background-size:22px 22px;opacity:.5;mix-blend-mode:soft-light}
.hero-art svg{position:absolute;inset:0;width:100%;height:100%}

/* ---------- marquee ---------- */
.logo-marquee{overflow:hidden;border-block:1px solid var(--border);padding-block:var(--space-4)}
.marquee-track{display:flex;gap:var(--space-8);width:max-content;animation:marquee 32s linear infinite}
.marquee-track:hover{animation-play-state:paused}
.marquee-item{font-family:var(--font-display);font-weight:700;font-size:var(--step-1);color:var(--text-muted);opacity:.75;white-space:nowrap;display:flex;align-items:center;gap:var(--space-2)}
@keyframes marquee{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.marquee-track{animation:none}}

/* ---------- cards / features ---------- */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-3);padding:var(--space-5);transition:transform var(--dur) var(--ease),box-shadow var(--dur) var(--ease),border-color var(--dur) var(--ease);height:100%}
.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-2);border-color:color-mix(in oklab,var(--primary) 40%,var(--border))}
.card h3{margin-block:var(--space-3) var(--space-2)}
.card p{color:var(--text-muted)}
.card-icon{width:48px;height:48px;border-radius:var(--radius-2);display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);margin-bottom:var(--space-2)}

/* ---------- stats ---------- */
.stats{display:grid;gap:var(--space-5);grid-template-columns:repeat(2,1fr)}
@media (min-width:800px){.stats{grid-template-columns:repeat(4,1fr)}}
.stat{text-align:left;padding-left:var(--space-4);border-left:2px solid var(--primary)}
.stat-value{font-family:var(--font-display);font-size:var(--step-3);font-weight:var(--weight-display);letter-spacing:var(--tracking-display);line-height:1;font-variant-numeric:tabular-nums}
.stat-label{margin-top:var(--space-2);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)}

/* ---------- steps / timeline ---------- */
.steps{display:grid;gap:var(--space-5);counter-reset:step}
@media (min-width:800px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{position:relative;padding-top:var(--space-5);border-top:2px solid var(--border)}
.step::before{content:counter(step);counter-increment:step;position:absolute;top:-16px;left:0;width:32px;height:32px;border-radius:var(--radius-pill);background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-size:0.85rem;font-weight:700}
.step h3{margin-block:var(--space-3) var(--space-2)}
.step p{color:var(--text-muted)}
.timeline{list-style:none;padding:0;display:grid;gap:var(--space-5);border-left:2px solid var(--border);padding-left:var(--space-5);margin-left:var(--space-3)}
.timeline li{position:relative}
.timeline li::before{content:"";position:absolute;left:calc(var(--space-5) * -1 - 6px);top:8px;width:12px;height:12px;border-radius:var(--radius-pill);background:var(--primary)}
.timeline h3{font-size:var(--step-0);margin-bottom:var(--space-1)}

/* ---------- testimonials ---------- */
.testimonial{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-3);padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-4)}
.testimonial blockquote{margin:0;font-size:var(--step-0)}
.testimonial footer{display:flex;align-items:center;gap:var(--space-3);margin-top:auto}
.avatar{width:44px;height:44px;border-radius:var(--radius-pill);display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);font-weight:700;font-size:0.9rem;flex:none}
.testimonial cite{font-style:normal;font-size:0.9rem}
.testimonial cite span{display:block;color:var(--text-muted)}

/* ---------- pricing ---------- */
.pricing{display:grid;gap:var(--space-5)}
@media (min-width:900px){.pricing{grid-template-columns:repeat(3,1fr);align-items:start}}
.plan{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-3);padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-4)}
.plan-popular{border-color:var(--primary);box-shadow:var(--shadow-2);position:relative}
.plan-popular::after{content:"Most popular";position:absolute;top:0;right:var(--space-4);transform:translateY(-50%);background:var(--primary);color:var(--on-primary);font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:var(--radius-pill)}
.plan-price{font-family:var(--font-display);font-size:var(--step-4);font-weight:var(--weight-display);letter-spacing:var(--tracking-display);line-height:1}
.plan-price span{font-family:var(--font-body);font-size:0.9rem;font-weight:400;color:var(--text-muted);letter-spacing:0}
.plan ul{list-style:none;padding:0;display:grid;gap:var(--space-2);color:var(--text-muted);font-size:0.95rem}
.plan li{display:flex;gap:var(--space-2);align-items:flex-start}
.plan li::before{content:"";width:18px;height:18px;flex:none;border-radius:var(--radius-pill);background:var(--primary-soft);color:var(--primary);background-image:linear-gradient(0deg,transparent,transparent)}
.plan li svg{width:18px;height:18px;flex:none;color:var(--primary)}
.plan .btn{margin-top:auto}
.plan-toggle{display:inline-flex;padding:4px;border:1px solid var(--border);border-radius:var(--radius-pill);background:var(--surface)}
.plan-toggle button{min-height:40px;padding-inline:var(--space-4);border-radius:var(--radius-pill);font-weight:600;font-size:0.9rem}
.plan-toggle button[aria-pressed="true"]{background:var(--primary);color:var(--on-primary)}

/* ---------- faq ---------- */
.faq{border-top:1px solid var(--border)}
.faq details{border-bottom:1px solid var(--border)}
.faq summary{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);padding-block:var(--space-4);font-weight:600;cursor:pointer;list-style:none;min-height:44px}
.faq summary::-webkit-details-marker{display:none}
.faq summary:hover{color:var(--primary)}
.faq-icon{position:relative;width:20px;height:20px;flex:none}
.faq-icon::before,.faq-icon::after{content:"";position:absolute;inset:50% 0 auto;height:2px;background:currentColor;transform:translateY(-50%)}
.faq-icon::after{transform:translateY(-50%) rotate(90deg);transition:transform var(--dur) var(--ease)}
.faq details[open] .faq-icon::after{transform:translateY(-50%) rotate(0)}
.faq details p{padding-bottom:var(--space-4);color:var(--text-muted);max-width:var(--measure)}

/* ---------- forms ---------- */
.form{display:grid;gap:var(--space-4);max-width:560px}
.field{display:grid;gap:var(--space-2)}
.field-label{font-weight:600;font-size:0.9rem}
.field-input{width:100%;min-height:48px;padding:var(--space-3);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-2);transition:border-color var(--dur) var(--ease),box-shadow var(--dur) var(--ease)}
.field-input:focus-visible{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in oklab,var(--primary) 25%,transparent);outline:none}
.field-input[aria-invalid="true"]{border-color:var(--danger)}
textarea.field-input{min-height:140px;resize:vertical}
.field-error{color:var(--danger);font-size:0.85rem;min-height:1.2em}
.field-error:empty{min-height:0}
.form-success{display:grid;gap:var(--space-3);padding:var(--space-5);border:1px solid var(--primary);border-radius:var(--radius-3);background:var(--primary-soft)}
[hidden]{display:none !important}

/* ---------- tabs / table / modal ---------- */
.tabs__list{display:flex;gap:var(--space-2);border-bottom:1px solid var(--border);overflow-x:auto}
.tab{padding:var(--space-3) var(--space-4);min-height:44px;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;white-space:nowrap}
.tab[aria-selected="true"]{color:var(--text);border-bottom-color:var(--primary)}
.table{font-size:0.95rem}
.table th,.table td{padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border)}
.table th{font-size:0.78rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted)}
.table tbody tr:nth-child(odd){background:var(--surface)}
.modal{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:var(--gutter);background:rgb(0 0 0 / 0.5);opacity:0;visibility:hidden;transition:opacity var(--dur) var(--ease),visibility var(--dur)}
.modal.is-open{opacity:1;visibility:visible}
.modal__panel{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-3);padding:var(--space-5);max-width:520px;width:100%;box-shadow:var(--shadow-3)}

/* ---------- cta / footer ---------- */
.cta-band{background:var(--primary);color:var(--on-primary);border-radius:var(--radius-4);padding:var(--space-7) var(--space-5);text-align:center;display:grid;gap:var(--space-4);justify-items:center}
.cta-band h2{color:inherit}
.cta-band p{color:inherit;opacity:.9;max-width:52ch}
.cta-band .btn-primary{background:var(--on-primary);color:var(--primary)}
.cta-band .btn-secondary{border-color:currentColor;color:inherit}
.site-footer{border-top:1px solid var(--border);padding-block:var(--space-6) var(--space-5);margin-top:var(--section-y)}
.footer-grid{display:grid;gap:var(--space-5);grid-template-columns:1fr}
@media (min-width:800px){.footer-grid{grid-template-columns:1.6fr repeat(3,1fr)}}
.footer-grid h3{font-size:var(--step-0);margin-bottom:var(--space-3)}
.footer-grid ul{list-style:none;padding:0;display:grid;gap:var(--space-2);color:var(--text-muted);font-size:0.95rem}
.footer-grid a:hover{color:var(--primary)}
.footer-legal{display:flex;flex-wrap:wrap;gap:var(--space-3) var(--space-5);justify-content:space-between;margin-top:var(--space-6);padding-top:var(--space-4);border-top:1px solid var(--border);color:var(--text-muted);font-size:0.85rem}
.back-to-top{position:fixed;right:var(--space-4);bottom:var(--space-4);z-index:30;width:48px;height:48px;border-radius:var(--radius-pill);background:var(--primary);color:var(--on-primary);display:grid;place-items:center;box-shadow:var(--shadow-2);opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity var(--dur) var(--ease),transform var(--dur) var(--ease),visibility var(--dur)}
.back-to-top.is-visible{opacity:1;visibility:visible;transform:translateY(0)}

/* ---------- reveal ---------- */
.reveal{opacity:0;transform:translateY(16px);transition:opacity 600ms var(--ease),transform 600ms var(--ease);transition-delay:calc(var(--i,0) * 60ms)}
.reveal.is-visible{opacity:1;transform:none}

/* ---------- pattern / grain ---------- */
.pattern-dot{background-image:radial-gradient(circle at 1px 1px,currentColor 1px,transparent 0);background-size:24px 24px;opacity:.05}
.badge{display:inline-flex;align-items:center;gap:var(--space-2);padding:4px 12px;border-radius:var(--radius-pill);background:var(--primary-soft);color:var(--primary);font-size:0.78rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase}
.pill{display:inline-flex;align-items:center;padding:4px 12px;border-radius:var(--radius-pill);border:1px solid var(--border);font-size:0.8rem;color:var(--text-muted)}
.tag-list{display:flex;flex-wrap:wrap;gap:var(--space-2)}

/* ---------- dark mode ---------- */
[data-theme="dark"] .card,[data-theme="dark"] .testimonial,[data-theme="dark"] .plan{background:var(--surface)}
[data-theme="dark"] .hero-art{filter:saturate(1.1) brightness(1.05)}
.theme-toggle{width:44px;height:44px;display:grid;place-items:center;border-radius:var(--radius-2);border:1px solid var(--border)}
.theme-toggle svg{display:none}
[data-theme="dark"] .theme-toggle .icon-sun{display:block}
[data-theme="dark"] .theme-toggle .icon-moon{display:none}
.theme-toggle .icon-moon{display:block}

/* ---------- reduced motion ---------- */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}
  .reveal{opacity:1 !important;transform:none !important}
  .marquee-track{animation:none !important}
  .btn:hover,.card:hover{transform:none !important}
}
`;
}

export function buildScript() {
  return `(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var on = function (el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts || false); };
  var qs = function (sel, root) { return (root || document).querySelector(sel); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  function focusables(root) { return qsa(FOCUSABLE, root).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; }); }

  /* ---------- theme ---------- */
  (function theme() {
    var root = document.documentElement;
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) { stored = null; }
    if (stored === 'dark' || stored === 'light') root.setAttribute('data-theme', stored);
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) root.setAttribute('data-theme', 'dark');
    qsa('.theme-toggle').forEach(function (btn) {
      on(btn, 'click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) {}
        btn.setAttribute('aria-pressed', String(next === 'dark'));
      });
    });
  })();

  /* ---------- header + drawer ---------- */
  (function nav() {
    var header = qs('[data-nav]') || qs('.site-header');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    on(window, 'scroll', onScroll, { passive: true });
    onScroll();

    var toggle = qs('.nav-toggle');
    var drawer = qs('#mobile-nav') || qs('.mobile-nav');
    var backdrop = qs('.nav-backdrop');
    if (!toggle || !drawer) return;

    var lastFocus = null;
    function open() {
      lastFocus = document.activeElement;
      drawer.classList.add('is-open');
      drawer.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-locked');
      if (backdrop) backdrop.classList.add('is-open');
      var first = focusables(drawer)[0];
      if (first) first.focus();
    }
    function close() {
      drawer.classList.remove('is-open');
      drawer.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-locked');
      if (backdrop) backdrop.classList.remove('is-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    on(toggle, 'click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') close(); else open();
    });
    on(backdrop, 'click', close);
    qsa('a', drawer).forEach(function (a) { on(a, 'click', close); });
    on(document, 'keydown', function (e) {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var items = focusables(drawer);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    var sections = qsa('[data-section]');
    if (sections.length && 'IntersectionObserver' in window) {
      var links = {};
      qsa('.nav-link[data-section]').forEach(function (l) { links[l.getAttribute('data-section')] = l; });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var link = links[entry.target.getAttribute('data-section')];
          if (!link) return;
          qsa('.nav-link.is-active').forEach(function (l) { l.classList.remove('is-active'); });
          link.classList.add('is-active');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { io.observe(s); });
    }
  })();

  /* ---------- reveal ---------- */
  (function reveal() {
    var items = qsa('.reveal');
    if (!items.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- count up ---------- */
  (function counters() {
    var nodes = qsa('.stat-value[data-target]');
    if (!nodes.length) return;
    function run(el) {
      var target = parseFloat(el.getAttribute('data-target'));
      if (isNaN(target)) return;
      var decimals = (String(target).split('.')[1] || '').length;
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      el.setAttribute('aria-label', prefix + target.toFixed(decimals) + suffix);
      if (reduceMotion) { el.textContent = prefix + target.toFixed(decimals) + suffix; return; }
      var start = performance.now();
      var dur = 1200;
      function frame(now) {
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    nodes.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- pricing toggle ---------- */
  (function pricing() {
    var toggle = qs('.plan-toggle');
    if (!toggle) return;
    var buttons = qsa('button', toggle);
    function apply(mode) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode)); });
      qsa('[data-price-monthly]').forEach(function (el) {
        el.textContent = el.getAttribute(mode === 'annual' ? 'data-price-annual' : 'data-price-monthly') || el.textContent;
      });
      qsa('[data-note]').forEach(function (el) {
        el.textContent = el.getAttribute(mode === 'annual' ? 'data-note-annual' : 'data-note-monthly') || el.textContent;
      });
    }
    buttons.forEach(function (b) { on(b, 'click', function () { apply(b.getAttribute('data-mode')); }); });
    apply(buttons[0] ? buttons[0].getAttribute('data-mode') : 'monthly');
  })();

  /* ---------- tabs ---------- */
  (function tabs() {
    var list = qs('[role="tablist"]');
    if (!list) return;
    var tabs = qsa('[role="tab"]', list);
    function select(idx) {
      tabs.forEach(function (tab, i) {
        var selected = i === idx;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        var panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) { if (selected) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', ''); }
      });
    }
    tabs.forEach(function (tab, i) {
      on(tab, 'click', function () { select(i); });
      on(tab, 'keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        tabs[next].focus();
        select(next);
      });
    });
    select(0);
  })();

  /* ---------- modal ---------- */
  (function modal() {
    var lastFocus = null;
    function closeAll() {
      qsa('.modal.is-open').forEach(function (m) {
        m.classList.remove('is-open');
        m.setAttribute('aria-hidden', 'true');
      });
      document.body.classList.remove('is-locked');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    qsa('[data-modal-open]').forEach(function (btn) {
      on(btn, 'click', function () {
        var m = document.getElementById(btn.getAttribute('data-modal-open'));
        if (!m) return;
        lastFocus = btn;
        m.classList.add('is-open');
        m.removeAttribute('aria-hidden');
        document.body.classList.add('is-locked');
        var first = focusables(m)[0];
        if (first) first.focus();
      });
    });
    qsa('[data-modal-close], .modal').forEach(function (el) {
      on(el, 'click', function (e) { if (e.target === el || el.hasAttribute('data-modal-close')) closeAll(); });
    });
    on(document, 'keydown', function (e) {
      var open = qs('.modal.is-open');
      if (!open) return;
      if (e.key === 'Escape') { closeAll(); return; }
      if (e.key !== 'Tab') return;
      var items = focusables(open);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  })();

  /* ---------- forms ---------- */
  (function forms() {
    qsa('form[data-validate]').forEach(function (form) {
      var success = form.getAttribute('data-success') ? document.getElementById(form.getAttribute('data-success')) : null;
      function setError(field, message) {
        var box = document.getElementById(field.id + '-error');
        field.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (box) box.textContent = message || '';
      }
      function validate(field) {
        var v = (field.value || '').trim();
        if (field.hasAttribute('required') && !v) { setError(field, field.getAttribute('data-label') + ' is required.'); return false; }
        if (field.type === 'email' && v && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v)) { setError(field, 'Enter a valid email address.'); return false; }
        if (field.type === 'checkbox' && field.hasAttribute('required') && !field.checked) { setError(field, 'Please tick this box.'); return false; }
        setError(field, '');
        return true;
      }
      var fields = qsa('input, textarea, select', form).filter(function (el) { return el.type !== 'hidden'; });
      fields.forEach(function (field) {
        on(field, 'blur', function () { if (field.value || field.hasAttribute('required')) validate(field); });
        on(field, 'input', function () { if (field.getAttribute('aria-invalid') === 'true') validate(field); });
      });
      on(form, 'submit', function (e) {
        e.preventDefault();
        var ok = true;
        fields.forEach(function (field) { if (!validate(field)) ok = false; });
        if (!ok) { var bad = qs('[aria-invalid="true"]', form); if (bad) bad.focus(); return; }
        if (success) { form.setAttribute('hidden', ''); success.removeAttribute('hidden'); success.setAttribute('tabindex', '-1'); success.focus(); }
      });
    });
  })();

  /* ---------- copy to clipboard ---------- */
  qsa('[data-copy]').forEach(function (btn) {
    on(btn, 'click', function () {
      var text = btn.getAttribute('data-copy') || '';
      var done = function () {
        var old = btn.getAttribute('data-label') || btn.textContent;
        btn.setAttribute('data-label', old);
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = old; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
      else done();
    });
  });

  /* ---------- back to top ---------- */
  (function toTop() {
    var btn = qs('.back-to-top');
    if (!btn) return;
    on(window, 'scroll', function () { btn.classList.toggle('is-visible', window.scrollY > 600); }, { passive: true });
    on(btn, 'click', function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
  })();

  /* ---------- year ---------- */
  qsa('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
`;
}

const ICONS = {
  spark: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
  layers: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  gauge: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 14 16 9"/><path d="M4 18a9 9 0 1 1 16 0"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>',
  arrow: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  up: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  sun: '<svg class="icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
  moon: '<svg class="icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/></svg>',
};

function heroArt() {
  return `<div class="hero-art" aria-hidden="true">
<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="presentation">
<defs>
<linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="currentColor" stop-opacity=".85"/>
<stop offset="1" stop-color="currentColor" stop-opacity=".2"/>
</linearGradient>
</defs>
<g fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55">
<circle cx="120" cy="110" r="72"/>
<circle cx="285" cy="190" r="54"/>
<path d="M40 240c60-70 120 40 200-30s110-40 130-20"/>
<path d="M60 60h80M60 78h56"/>
</g>
<rect x="150" y="120" width="120" height="80" rx="10" fill="url(#g1)"/>
<path d="M168 168l22-26 18 20 20-28 26 34" fill="none" stroke="var(--bg)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
</div>`;
}

/** plan.pages is an array of page objects; these helpers need only the paths. */
function pagePaths(plan) {
  return (plan?.pages ?? []).map((p) => (typeof p === 'string' ? p : p.path));
}

/**
 * Where the primary CTA should point. A plan without a contact section must not
 * link to #contact — the validator treats a missing anchor as a broken link.
 */
function ctaTarget(plan) {
  const home = (plan?.pages ?? []).find((p) => (typeof p === 'string' ? p : p.path) === 'index.html');
  const sections = home?.sections ?? [];
  for (const slug of ['contact', 'cta', 'pricing', 'faq']) {
    if (sections.includes(slug)) return `index.html#${slug}`;
  }
  const contact = pagePaths(plan).find((p) => /contact/i.test(p));
  return contact ? `${contact}#contact` : 'index.html#main';
}

/** Section links in the footer, filtered to what the home page actually renders. */
function companyLinks(plan) {
  const home = (plan?.pages ?? []).find((p) => (typeof p === 'string' ? p : p.path) === 'index.html');
  const sections = new Set(home?.sections ?? []);
  const wanted = [
    ['features', 'How it works'],
    ['showcase', 'Showcase'],
    ['pricing', 'Pricing'],
    ['testimonials', 'Customers'],
    ['faq', 'FAQ'],
  ];
  const rows = wanted.filter(([slug]) => sections.has(slug)).map(([slug, label]) => `              <li><a href="index.html#${slug}">${label}</a></li>`);
  return rows.length ? rows.join('\n') : '              <li><a href="index.html#main">Back to top</a></li>';
}

function navMarkup(plan, current) {
  const others = pagePaths(plan).filter((p) => p !== current);
  const links = pagePaths(plan)
    .map((p) => {
      const label = p === 'index.html' ? 'Home' : titleCase(p.replace('.html', ''));
      const href = p === 'index.html' ? 'index.html' : p;
      const active = p === current ? ' class="nav-link is-active"' : ' class="nav-link"';
      return `<a${active} href="${href}">${label}</a>`;
    })
    .join('\n        ');
  const mobileLinks = pagePaths(plan)
    .map((p) => {
      const label = p === 'index.html' ? 'Home' : titleCase(p.replace('.html', ''));
      return `<a href="${p}">${label}</a>`;
    })
    .join('\n      ');
  return {
    desktop: `      <nav class="nav-desktop" aria-label="Primary">
        ${links}
        <a class="btn btn-primary" href="${ctaTarget(plan)}">Start free</a>
      </nav>`,
    mobile: `      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">
        <span></span>
      </button>
      <div class="nav-backdrop" hidden-aria></div>
      <nav id="mobile-nav" class="mobile-nav" aria-label="Mobile" hidden>
      ${mobileLinks}
        <a class="btn btn-primary" href="${ctaTarget(plan)}">Start free</a>
      </nav>`,
    others,
  };
}

function footerMarkup(plan, current) {
  const links = pagePaths(plan)
    .map((p) => `<li><a href="${p}">${p === 'index.html' ? 'Home' : titleCase(p.replace('.html', ''))}</a></li>`)
    .join('\n            ');
  return `    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="stack">
            <span class="brand"><span class="brand__mark" aria-hidden="true">${escapeHtml(plan.brandName.slice(0, 1))}</span>${escapeHtml(plan.brandName)}</span>
            <p class="muted">${escapeHtml(plan.tagline)}. Built for ${escapeHtml(plan.audience)}.</p>
          </div>
          <div>
            <h3>Site</h3>
            <ul>
            ${links}
            </ul>
          </div>
          <div>
            <h3>Company</h3>
            <ul>
${companyLinks(plan)}
            </ul>
          </div>
          <div>
            <h3>Contact</h3>
            <ul>
              <li><a href="${ctaTarget(plan)}">Start a project</a></li>
              <li><a href="mailto:hello@example.com">hello@example.com</a></li>
              <li><a href="${ctaTarget(plan)}">Book a walkthrough</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-legal">
          <span>&copy; <span data-year>2026</span> ${escapeHtml(plan.brandName)}. All rights reserved.</span>
          <span><a href="index.html#faq">Privacy</a> &middot; <a href="index.html#faq">Terms</a></span>
        </div>
      </div>
    </footer>`;
}

function head(plan, page, tokens) {
  const desc = escapeHtml(plan.seo.metaDescription);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': plan.seo.jsonLdType,
    name: plan.brandName,
    description: plan.seo.metaDescription,
    url: `https://example.com/${page.path}`,
  };
  if (plan.seo.jsonLdType === 'LocalBusiness') jsonLd.address = { '@type': 'PostalAddress', addressLocality: 'Portland', addressCountry: 'US' };
  return `  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${desc}">
    <link rel="canonical" href="https://example.com/${page.path}">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <link rel="manifest" href="site.webmanifest">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(plan.brandName)}">
    <meta property="og:title" content="${escapeHtml(plan.seo.ogTitle)}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="og-image.svg">
    <meta property="og:url" content="https://example.com/${page.path}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(plan.seo.ogTitle)}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="og-image.svg">
    <meta name="theme-color" content="${tokens.palette.primary}">
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  </head>`;
}

function headerBlock(plan, page, tokens) {
  const nav = navMarkup(plan, page.path);
  return `  <body class="site">
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header" data-nav>
      <div class="container site-header__inner">
        <a class="brand" href="index.html"><span class="brand__mark" aria-hidden="true">${escapeHtml(plan.brandName.slice(0, 1))}</span>${escapeHtml(plan.brandName)}</a>
${nav.desktop}
        <div class="cluster">
          <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Toggle dark mode">${ICONS.sun}${ICONS.moon}</button>
${nav.mobile}
        </div>
      </div>
    </header>`;
}

/* --------------------------------------------------------------- sections */

function sectionHero(plan, tokens, ctx = { sectionHref: (slug) => ctaTarget(plan) }) {
  return `      <section class="section hero" id="hero" data-section="hero">
        <div class="container hero__grid">
          <div>
            <span class="badge">${escapeHtml(plan.audience.split(' ').slice(0, 4).join(' '))}</span>
            <h1>${escapeHtml(plan.brandName)} makes the boring part of your week disappear.</h1>
            <p class="lede">${escapeHtml(plan.tagline)}. ${escapeHtml(plan.summary.replace(/^A complete static site for [^:]+: /, ''))}</p>
            <div class="hero__actions">
              <a class="btn btn-primary btn-lg" href="${ctaTarget(plan)}">Start free<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
              <a class="btn btn-secondary btn-lg" href="${ctx.sectionHref('features')}">See how it works</a>
            </div>
            <div class="trust-row">
              <div><strong>4.9/5</strong><span>Average rating, 1,240 reviews</span></div>
              <div><strong>30 days</strong><span>To cancel, no card games</span></div>
              <div><strong>2 min</strong><span>Median setup time</span></div>
            </div>
          </div>
          ${heroArt()}
        </div>
      </section>`;
}

function sectionLogoMarquee(plan) {
  const names = ['Northwind', 'Bellwether', 'Kestrel', 'Foundry', 'Lumen', 'Harbour', 'Vantage', 'Perch'];
  const item = (n) => `<span class="marquee-item">${ICONS.spark}${escapeHtml(n)}</span>`;
  const row = names.map(item).join('\n        ');
  return `      <div class="logo-marquee" aria-label="Teams using ${escapeHtml(plan.brandName)}">
        <p class="container eyebrow" style="margin-bottom:var(--space-4)">Teams already shipping with ${escapeHtml(plan.brandName)}</p>
        <div class="marquee-track">
        ${row}
        ${row}
        </div>
      </div>`;
}

function sectionFeatures(plan) {
  const features = [
    [ICONS.gauge, 'It starts in minutes, not sprints', 'Import what you already have and see something real before the meeting ends. No implementation project, no consultant.'],
    [ICONS.layers, 'One place instead of four tabs', 'The thing you are chasing, the person who approved it, and the number it moved — all on one screen, in one vocabulary.'],
    [ICONS.shield, 'Quietly correct by default', 'Every change is versioned, reversible and reviewable. Nothing you did not ask for happens behind your back.'],
  ];
  return `      <section class="section" id="features" data-section="features">
        <div class="container stack">
          <span class="eyebrow">What it does</span>
          <h2>Everything you need, nothing you do not</h2>
          <p class="lede">Three things done properly beat thirty done eventually.</p>
          <div class="grid grid-3">
${features
        .map(
          ([icon, title, body]) => `            <article class="card reveal">
              <span class="card-icon" aria-hidden="true">${icon}</span>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(body)}</p>
            </article>`,
        )
        .join('\n')}
          </div>
        </div>
      </section>`;
}

function sectionStats(plan) {
  const stats = [
    ['99.98', '%', 'Uptime over the last 12 months'],
    ['2.4', 'min', 'Median time to first result'],
    ['61', '%', 'Less time on manual reporting'],
    ['4.9', '/5', 'Across 1,240 verified reviews'],
  ];
  return `      <section class="section section--alt" id="stats" data-section="stats">
        <div class="container">
          <span class="eyebrow">By the numbers</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">The numbers that matter</h2>
          <div class="stats">
${stats
        .map(
          ([value, suffix, label]) => `            <div class="stat reveal">
              <div class="stat-value" data-target="${value}" data-suffix="${suffix}" aria-label="${value}${suffix}">${value}${suffix}</div>
              <div class="stat-label">${escapeHtml(label)}</div>
            </div>`,
        )
        .join('\n')}
          </div>
        </div>
      </section>`;
}

function sectionSteps(plan) {
  const steps = [
    ['Connect the thing', 'Point it at the systems you already run. Read-only at first, so nothing can break on day one.'],
    ['Describe the outcome', 'Say what good looks like in your own words. It turns that into the dashboards, alerts and reports you will actually read.'],
    ['Stop doing it by hand', 'Once the numbers match, the recurring job stops being a person. That is the whole point.'],
  ];
  return `      <section class="section" id="how-it-works" data-section="how-it-works">
        <div class="container">
          <span class="eyebrow">How it works</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">Three steps, then it is done</h2>
          <div class="steps">
${steps
        .map(
          ([title, body]) => `            <div class="step reveal">
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(body)}</p>
            </div>`,
        )
        .join('\n')}
          </div>
        </div>
      </section>`;
}

function sectionTimeline(plan) {
  const items = [
    ['2021', 'Two people and a spreadsheet, solving our own problem first.'],
    ['2023', 'First 100 teams. The awkward parts of the product got deleted.'],
    ['2024', 'Public launch. Zero-to-first-result dropped under five minutes.'],
    ['2026', `${plan.brandName} runs on the same principle it started with: show the number, then get out of the way.`],
  ];
  return `      <section class="section section--alt" id="timeline" data-section="timeline">
        <div class="container">
          <span class="eyebrow">History</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">How we got here</h2>
          <ol class="timeline">
${items
        .map(([year, body]) => `            <li class="reveal"><h3>${escapeHtml(year)}</h3><p class="muted">${escapeHtml(body)}</p></li>`)
        .join('\n')}
          </ol>
        </div>
      </section>`;
}

function sectionShowcase(plan) {
  const items = [
    ['Northwind Logistics', 'Cut weekly reporting from six hours to twenty minutes.', 'Warehouse ops, 340 staff'],
    ['Bellwether Health', 'One shared view across nine clinics, live.', 'Multi-site care'],
    ['Kestrel Capital', 'Replaced three dashboards nobody opened.', 'Finance, 60 staff'],
  ];
  return `      <section class="section" id="showcase" data-section="showcase">
        <div class="container">
          <span class="eyebrow">Recent work</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">What it looks like once it is working</h2>
          <div class="grid grid-3">
${items
        .map(
          ([name, result, tag]) => `            <article class="card reveal">
              <span class="pill">${escapeHtml(tag)}</span>
              <h3 style="margin-block:var(--space-3) var(--space-2)">${escapeHtml(name)}</h3>
              <p>${escapeHtml(result)}</p>
            </article>`,
        )
        .join('\n')}
          </div>
        </div>
      </section>`;
}

function sectionTestimonials(plan) {
  const quotes = [
    ['We cancelled two tools the week we switched. The reporting alone paid for it by March.', 'Priya Raman', 'Head of Operations, Northwind Logistics'],
    ['I was the sceptic. Two hours in, my finance lead asked when we were rolling it out to the other teams.', 'Tomas Lindqvist', 'CFO, Kestrel Capital'],
    ['The setup genuinely took one coffee. Our Monday meeting got 40 minutes shorter.', 'Amara Osei', 'Programme Manager, Bellwether Health'],
  ];
  return `      <section class="section section--alt" id="testimonials" data-section="testimonials">
        <div class="container">
          <span class="eyebrow">Customers</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">What people say when we are not in the room</h2>
          <div class="grid grid-3">
${quotes
        .map(([quote, name, role]) => {
          const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2);
          return `            <figure class="testimonial reveal">
              <blockquote><p>&ldquo;${escapeHtml(quote)}&rdquo;</p></blockquote>
              <footer>
                <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
                <cite>${escapeHtml(name)}<span>${escapeHtml(role)}</span></cite>
              </footer>
            </figure>`;
        })
        .join('\n')}
          </div>
        </div>
      </section>`;
}

function sectionPricing(plan, _tokens, ctx = { sectionHref: (slug) => ctaTarget(plan) }) {
  const plans = [
    ['Starter', '$0', 'Free forever', ['1 project', 'Community support', '7-day history'], false, 'Start free'],
    ['Team', '$39', 'per seat / month', ['Unlimited projects', 'Email support, 1 business day', '2-year history', 'Exports and alerts'], true, 'Start 30-day trial'],
    ['Company', 'Talk to us', 'annual agreement', ['SSO and audit log', 'Dedicated engineer', 'Custom data residency', '99.99% SLA'], false, 'Book a walkthrough'],
  ];
  return `      <section class="section" id="pricing" data-section="pricing">
        <div class="container">
          <span class="eyebrow">Pricing</span>
          <h2 style="margin-block:var(--space-3) var(--space-3)">Pricing you can predict</h2>
          <p class="lede" style="margin-bottom:var(--space-5)">No usage meters, no surprise invoices, no "contact us" where a number would do.</p>
          <div class="cluster" style="margin-bottom:var(--space-5)">
            <div class="plan-toggle" role="group" aria-label="Billing period">
              <button type="button" data-mode="monthly" aria-pressed="true">Monthly</button>
              <button type="button" data-mode="annual" aria-pressed="false">Annual &mdash; two months free</button>
            </div>
          </div>
          <div class="pricing">
${plans
        .map(([name, price, note, features, popular, cta]) => {
          const annual = name === 'Team' ? '$31' : price === '$0' ? '$0' : price;
          return `            <article class="plan${popular ? ' plan-popular' : ''}">
              <h3>${escapeHtml(name)}</h3>
              <div class="plan-price"${price === '$0' || price === 'Talk to us' ? '' : ` data-price-monthly="${escapeHtml(price)}" data-price-annual="${escapeHtml(annual)}"`}>${escapeHtml(price)} <span data-note data-note-monthly="${escapeHtml(note)}" data-note-annual="${escapeHtml(note.replace('per seat / month', 'per seat / month, billed yearly'))}">${escapeHtml(note)}</span></div>
              <ul>
${features.map((f) => `                <li>${ICONS.check}<span>${escapeHtml(f)}</span></li>`).join('\n')}
              </ul>
              <a class="btn ${popular ? 'btn-primary' : 'btn-secondary'}" href="${ctaTarget(plan)}">${escapeHtml(cta)}</a>
            </article>`;
        })
        .join('\n')}
          </div>
        </div>
      </section>`;
}

function sectionFaq(plan) {
  const faqs = [
    ['How long does setup actually take?', 'Median is two minutes. The slow part is deciding what to connect, not the connecting. If you can open three browser tabs you already have enough to start.'],
    ['What happens to my data?', 'It stays where it is. We read from your systems and write nothing back without an explicit, logged action from you. Export everything as CSV or JSON whenever you want.'],
    ['Can I cancel without a conversation?', 'Yes. The plan is monthly by default and the cancel button is on the billing page, not behind a support ticket. Your data stays exportable for 30 days afterwards.'],
    ['Is there a limit I will hit unexpectedly?', 'No. There is no seat minimum, no read quota and no feature that unlocks after a call with sales. The only limits are the ones written on this page.'],
    ['Do you offer discounts for annual billing?', 'Two months free on annual Team, which is the best rate we offer. Non-profits and students get the same rate for as long as the status lasts.'],
  ];
  return `      <section class="section section--alt" id="faq" data-section="faq">
        <div class="container">
          <span class="eyebrow">Questions</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">Questions worth answering</h2>
          <div class="faq">
${faqs
        .map(
          ([q, a]) => `            <details>
              <summary>${escapeHtml(q)}<span class="faq-icon" aria-hidden="true"></span></summary>
              <p>${escapeHtml(a)}</p>
            </details>`,
        )
        .join('\n')}
          </div>
        </div>
      </section>`;
}

function sectionContact(plan) {
  return `      <section class="section" id="contact" data-section="contact">
        <div class="container split">
          <div class="stack">
            <span class="eyebrow">Get started</span>
            <h2>Tell us what the boring part is</h2>
            <p class="lede">One form, one reply from a person, and a walkthrough only if you want one. No sequence, no drip campaign.</p>
            <ul class="stack" style="list-style:none;padding:0;color:var(--text-muted)">
              <li class="cluster">${ICONS.check}<span>A reply within one business day</span></li>
              <li class="cluster">${ICONS.check}<span>No card required to start</span></li>
              <li class="cluster">${ICONS.check}<span>Your data is exportable from day one</span></li>
            </ul>
          </div>
          <form class="form" data-validate data-success="contact-success" novalidate>
            <div class="field">
              <label class="field-label" for="contact-name">Your name</label>
              <input class="field-input" id="contact-name" name="name" type="text" required data-label="Name" autocomplete="name" aria-describedby="contact-name-error">
              <p class="field-error" id="contact-name-error" role="alert"></p>
            </div>
            <div class="field">
              <label class="field-label" for="contact-email">Work email</label>
              <input class="field-input" id="contact-email" name="email" type="email" required data-label="Email" autocomplete="email" aria-describedby="contact-email-error">
              <p class="field-error" id="contact-email-error" role="alert"></p>
            </div>
            <div class="field">
              <label class="field-label" for="contact-message">What is the boring part?</label>
              <textarea class="field-input" id="contact-message" name="message" required data-label="Message" aria-describedby="contact-message-error"></textarea>
              <p class="field-error" id="contact-message-error" role="alert"></p>
            </div>
            <button class="btn btn-primary btn-lg" type="submit">Send it</button>
          </form>
          <div class="form-success" id="contact-success" hidden>
            <strong>Got it.</strong>
            <p>Thanks &mdash; we have your note and will reply within one business day. Nothing else to do.</p>
          </div>
        </div>
      </section>`;
}

function sectionCta(plan, _tokens, ctx = { sectionHref: (slug) => ctaTarget(plan) }) {
  return `      <section class="section" id="cta" data-section="cta">
        <div class="container">
          <div class="cta-band reveal">
            <h2>Ready when you are</h2>
            <p>Start on the free plan, keep it forever if it stays useful, and cancel in one click if it does not.</p>
            <div class="cluster" style="justify-content:center">
              <a class="btn btn-primary btn-lg" href="${ctaTarget(plan)}">Start free</a>
              <a class="btn btn-secondary btn-lg" href="${ctx.sectionHref('pricing')}">See pricing</a>
            </div>
          </div>
        </div>
      </section>`;
}

function sectionTable(plan) {
  const rows = [
    ['Projects', '1', 'Unlimited', 'Unlimited'],
    ['History retained', '7 days', '2 years', 'Indefinite'],
    ['Exports', 'CSV', 'CSV, JSON', 'CSV, JSON, S3'],
    ['Support', 'Community', '1 business day', 'Dedicated engineer'],
    ['SSO', '—', '—', 'Included'],
  ];
  return `      <section class="section" id="table" data-section="table">
        <div class="container">
          <span class="eyebrow">Compare</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">Everything in one place</h2>
          <div style="overflow-x:auto">
            <table class="table">
              <caption class="visually-hidden">Plan comparison for ${escapeHtml(plan.brandName)}</caption>
              <thead><tr><th scope="col">Feature</th><th scope="col">Starter</th><th scope="col">Team</th><th scope="col">Company</th></tr></thead>
              <tbody>
${rows.map((r) => `                <tr><th scope="row">${escapeHtml(r[0])}</th><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td><td>${escapeHtml(r[3])}</td></tr>`).join('\n')}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
}

function sectionTabs(plan) {
  return `      <section class="section" id="tabs" data-section="tabs">
        <div class="container">
          <span class="eyebrow">Views</span>
          <h2 style="margin-block:var(--space-3) var(--space-5)">Pick your view</h2>
          <div class="tabs">
            <div class="tabs__list" role="tablist" aria-label="Product views">
              <button class="tab" type="button" role="tab" id="tab-week" aria-selected="true" aria-controls="panel-week">This week</button>
              <button class="tab" type="button" role="tab" id="tab-month" aria-selected="false" aria-controls="panel-month" tabindex="-1">This month</button>
              <button class="tab" type="button" role="tab" id="tab-year" aria-selected="false" aria-controls="panel-year" tabindex="-1">This year</button>
            </div>
            <div class="card" role="tabpanel" id="panel-week" aria-labelledby="tab-week" tabindex="0">
              <h3>Four reviews, no blockers</h3>
              <p class="muted">Everything shipped that was promised. Two decisions are still open and both have an owner.</p>
            </div>
            <div class="card" role="tabpanel" id="panel-month" aria-labelledby="tab-month" tabindex="0" hidden>
              <h3>Twenty-six reviews, one slipped</h3>
              <p class="muted">The billing migration moved a week. It has a revised date and a written reason, which is more than most.</p>
            </div>
            <div class="card" role="tabpanel" id="panel-year" aria-labelledby="tab-year" tabindex="0" hidden>
              <h3>A year of small, correct decisions</h3>
              <p class="muted">Median cycle time down 38%, on-call pages down 61%, and no incident that needed a postmortem longer than one page.</p>
            </div>
          </div>
        </div>
      </section>`;
}

function sectionTeam(plan) {
  const people = [
    ['Priya Raman', 'Operations', 'Ran warehouse ops for six years before building the thing she wished she had.'],
    ['Tomas Lindqvist', 'Finance', 'Spent a decade closing the books by hand. Now he audits the software instead.'],
    ['Amara Osei', 'Support', 'Answers every ticket. Has never once used a script.'],
  ];
  return `      <section class="section" id="team" data-section="team">
        <div class="container">
          <span class="eyebrow">Team</span>
          <h2 style="margin-block:var(--space-3) var(--space-6)">Who you will actually work with</h2>
          <div class="grid grid-3">
${people
        .map(([name, role, bio]) => {
          const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2);
          return `            <article class="card reveal">
              <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
              <h3 style="margin-block:var(--space-3) var(--space-1)">${escapeHtml(name)}</h3>
              <p class="eyebrow" style="margin-bottom:var(--space-3)">${escapeHtml(role)}</p>
              <p>${escapeHtml(bio)}</p>
            </article>`;
        })
        .join('\n')}
          </div>
        </div>
      </section>`;
}

const SECTION_RENDERERS = {
  hero: sectionHero,
  'logo-marquee': sectionLogoMarquee,
  features: sectionFeatures,
  stats: sectionStats,
  problem: sectionFeatures,
  solution: sectionFeatures,
  'how-it-works': sectionSteps,
  steps: sectionSteps,
  showcase: sectionShowcase,
  'case-study': sectionShowcase,
  timeline: sectionTimeline,
  testimonials: sectionTestimonials,
  'customer-stories': sectionTestimonials,
  pricing: sectionPricing,
  faq: sectionFaq,
  table: sectionTable,
  tabs: sectionTabs,
  team: sectionTeam,
  contact: sectionContact,
  newsletter: sectionContact,
  'cta-band': sectionCta,
  cta: sectionCta,
};

/** The DOM id each slug renders, so two slugs can never collide. */
const SECTION_IDS = {
  problem: 'features',
  solution: 'features',
  'how-it-works': 'steps',
  'customer-stories': 'testimonials',
  'case-study': 'showcase',
  newsletter: 'contact',
  cta: 'cta-band',
};

/**
 * An in-page anchor only when this page actually has that section; otherwise link
 * to the home page's copy of it. A dead #anchor is a blocking failure.
 */
function sectionHref(plan, currentSections, slug) {
  if (currentSections.includes(slug)) return `#${slug}`;
  const home = (plan?.pages ?? []).find((p) => (typeof p === 'string' ? p : p.path) === 'index.html');
  if (home?.sections?.includes(slug)) return `index.html#${slug}`;
  return ctaTarget(plan);
}

export function buildPage(plan, design, page, options = {}) {
  const tokens = normaliseTokens(design);
  const sections = page.sections?.length ? page.sections : ['hero', 'features', 'cta-band'];
  // Two slugs can share one renderer ('showcase' and 'case-study'), so dedupe on
  // the rendered section id — otherwise the page ships duplicate ids.
  const seen = new Set();
  const rendered = [];
  const body = sections
    .map((slug) => {
      const renderer = SECTION_RENDERERS[slug];
      const id = SECTION_IDS[slug] ?? slug;
      if (!renderer || seen.has(id)) return '';
      seen.add(id);
      const html = renderer(plan, tokens, { plan, page, sections, sectionHref: (target) => sectionHref(plan, sections, target) });
      rendered.push(id);
      return html;
    })
    .filter(Boolean)
    .join('\n\n');

  return `<!doctype html>
<html lang="en">
${head(plan, page, tokens)}
${headerBlock(plan, page, tokens)}

    <main id="main">
${body}
    </main>

${footerMarkup(plan, page.path)}

    <button class="back-to-top" type="button" aria-label="Back to top">${ICONS.up}</button>
  </body>
</html>
`;
}

export function buildFavicon(plan, design) {
  const tokens = normaliseTokens(design);
  const letter = escapeHtml(plan.brandName.slice(0, 1).toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escapeHtml(plan.brandName)}">
  <rect width="64" height="64" rx="14" fill="${tokens.palette.primary}"/>
  <text x="32" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="700" fill="${tokens.palette.onPrimary}">${letter}</text>
</svg>
`;
}

export function buildOgImage(plan, design) {
  const tokens = normaliseTokens(design);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="${escapeHtml(plan.brandName)} — ${escapeHtml(plan.tagline)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tokens.palette.primary}"/>
      <stop offset="1" stop-color="${tokens.palette.accent}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="120" r="220" fill="${tokens.palette.onPrimary}" opacity="0.12"/>
  <circle cx="140" cy="560" r="180" fill="${tokens.palette.onPrimary}" opacity="0.1"/>
  <text x="80" y="300" font-family="Georgia, serif" font-size="84" font-weight="700" fill="${tokens.palette.onPrimary}">${escapeHtml(plan.brandName)}</text>
  <text x="80" y="380" font-family="system-ui, sans-serif" font-size="34" fill="${tokens.palette.onPrimary}" opacity="0.92">${escapeHtml(plan.tagline)}</text>
  <text x="80" y="560" font-family="system-ui, sans-serif" font-size="24" fill="${tokens.palette.onPrimary}" opacity="0.7">${escapeHtml(plan.audience)}</text>
</svg>
`;
}

export function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
`;
}

export function buildSitemap(plan) {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${plan.pages
    .map(
      (p) => `  <url>
    <loc>https://example.com/${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${p.path === 'index.html' ? '1.0' : '0.7'}</priority>
  </url>`,
    )
    .join('\n')}
</urlset>
`;
}

export function buildManifest(plan, design) {
  const tokens = normaliseTokens(design);
  return JSON.stringify(
    {
      name: plan.brandName,
      short_name: plan.brandName.slice(0, 12),
      description: plan.seo.metaDescription,
      start_url: 'index.html',
      scope: './',
      display: 'standalone',
      background_color: tokens.palette.background,
      theme_color: tokens.palette.primary,
      icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
    null,
    2,
  );
}

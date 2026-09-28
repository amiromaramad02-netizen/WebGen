/**
 * THE DESIGN SKILL LIBRARY.
 *
 * Each skill is data, not a prompt: an id, a group, a short "instruction" that
 * gets injected into the page-writing call, and optional machine-checkable
 * "tokens" that the token generator uses to build the :root block.
 *
 * Selection rule: exactly one `layout` archetype, one `typography` family recipe,
 * one `color` recipe, and a set of `component` / `motion` / `media` / `trust`
 * skills chosen from the brief and the plan. At most two skills may be marked
 * `conflictsWith` each other.
 */

import { stableHash } from '../util/text.js';

export const SKILL_GROUPS = ['layout', 'typography', 'color', 'space', 'motion', 'component', 'media', 'trust'];

/* ------------------------------------------------------------------ layout */

export const LAYOUT_SKILLS = {
  'landing-conversion': {
    instruction:
      'Classic conversion landing architecture: hero (headline + subhead + primary CTA + secondary CTA + trust row) → social proof strip → problem → solution → 3-6 feature cards → how-it-works steps → testimonial → pricing → FAQ → final CTA band → footer. Every section earns its place and the CTA is repeated with changing context, never copy-pasted.',
    prompt: 'One dominant column max 1200px, 12-column inner grid, asymmetric 7/5 hero split, cards on a 3-up grid that collapses to 1-up.',
  },
  'editorial-magazine': {
    instruction:
      'Editorial rhythm: wide gutters, a strong left-aligned type column, hairline rules instead of boxes, an oversized display headline that breaks the grid, pull quotes set in the display face, and generous asymmetric white space. No cards where a rule would do.',
    prompt: '12-col grid, content spans 7 cols, marginalia spans 3, baseline-driven vertical rhythm, rules at 1px --border.',
  },
  'swiss-grid': {
    instruction:
      'Swiss/International Style: strict modular grid, flush-left ragged-right, one grotesk family, objective photography replaced by geometric SVG, a single red accent used sparingly, and visible grid discipline. Everything aligns to columns.',
    prompt: 'Strict 12-col grid with 24px gutter, no centred text except the hero statement, one accent colour, uppercase micro-labels with +0.08em tracking.',
  },
  'soft-organic': {
    instruction:
      'Soft organic: generous border radii, blob-shaped SVG masks, layered translucent gradients, an optional 3% SVG noise grain overlay, pastel palette, floating cards with soft layered shadows, and overlapping section transitions.',
    prompt: 'radius 999 on pills, 28-40px on cards, blob <mask> shapes, radial-gradient mesh backgrounds, grain via feTurbulence data URI at 3-4% opacity.',
  },
  'brutalist-raw': {
    instruction:
      'Raw brutalism: no border radius anywhere, visible 2px black borders, system monospace for everything, unapologetic raw black on off-white, one screaming accent, blocky shadows at zero blur, and no smoothing.',
    prompt: 'border-radius: 0 globally, 2px solid borders, box-shadow: 6px 6px 0 currentColor, monospace stack, uppercase headings.',
  },
  glassmorphism: {
    instruction:
      'Glassmorphism, done with restraint: an ambient animated gradient mesh behind the content, translucent panels using color-mix with transparency, backdrop-filter: blur() with a -webkit- fallback, 1px inner highlight border, and enough opaque contrast that body text still hits 4.5:1. Never blur the text itself.',
    prompt: 'body has a fixed multi-stop radial gradient mesh; panels are rgba surfaces at 0.55-0.75 alpha with backdrop-filter: blur(16px) saturate(140%) and a 1px rgba(255,255,255,.18) inset border.',
  },
  'neo-brutal': {
    instruction:
      'Neo-brutal: saturated flat fills, hard offset shadows with zero blur (4-8px), chunky 3px borders in near-black, bold oversized type, buttons that translate on press, and a small number of loud accent colours used on purpose.',
    prompt: 'box-shadow: 6px 6px 0 #0b0b0b, translate(6px,6px) on :active, 3px solid #0b0b0b borders, saturated fills.',
  },
  'minimal-luxury': {
    instruction:
      'Minimal luxury: very large whitespace, a thin display serif or wide-tracked grotesk for headings, hairline dividers, a near-monochrome palette with one deep accent, uppercase micro-labels at wide tracking, slow 400ms transitions, and a single centred column that never feels busy.',
    prompt: 'h1 at clamp(3rem, 9vw, 7rem) with -0.03em tracking, section padding >= 140px, 1px --border rules, max 3 elements per viewport band.',
  },
  'maximalist-pop': {
    instruction:
      'Maximalist pop: layered sticker-like rotated elements, clashing saturated colours, a marquee ticker, dense composition, thick display type, and texture overlays. Keep text legible by giving every text block its own solid backing.',
    prompt: 'Rotated sticker cards (-4deg to 4deg), 2-3 clashing hues, repeating marquee animation, 900-weight display type, every text block on a solid chip.',
  },
  'dashboard-dense': {
    instruction:
      'Data-dense layout: compact 8px rhythm, a 12-col grid, real HTML tables with zebra striping, inline CSS sparkline bars, KPI tiles with big numbers and small delta chips, and status pills. All charts are CSS, no libraries.',
    prompt: 'Compact 12-16px type, 1px table rules, KPI cards with --space-3 padding, CSS bar sparklines from linear-gradient, status pills with tinted backgrounds.',
  },
};

/* -------------------------------------------------------------- typography */

export const TYPOGRAPHY_SKILLS = {
  'fluid-clamp-scale': {
    instruction:
      'Every font size is a clamp() expression, so type scales fluidly between 360px and 1440px. Use a modular scale for the heading ladder.',
    prompt: 'clamp() for h1..h6, body, small, and eyebrow labels. --step--1..--step-6 custom properties computed in :root.',
  },
  'pair-serif-display': {
    instruction: 'A display serif carries headlines; the body stays a neutral sans. The contrast between them is the personality.',
    prompt: 'Georgia / "Iowan Old Style" / "Times New Roman" for display; system sans for body.',
  },
  'pair-grotesk-body': {
    instruction:
      'One grotesk does everything, with weight and tracking doing the differentiating. Tight tracking on large text, relaxed on small caps.',
    prompt: 'system-ui / -apple-system / "Segoe UI" / Roboto everywhere, weight 700-900 for display, tracking -0.02em above 32px.',
  },
  'mono-accent': {
    instruction:
      'A monospace face is used only for eyebrows, code, data and metadata — as a deliberate texture, never for paragraphs.',
    prompt: 'ui-monospace / SFMono-Regular / Menlo / Consolas for .eyebrow, kbd, code, and stat labels only.',
  },
  'editorial-dropcap': {
    instruction: 'The first paragraph of a long-form section opens with a proper drop cap that respects the baseline grid.',
    prompt: '.lede::first-letter at 3.4em, float left, line-height .82, colour from the accent token, with correct optical margin.',
  },
  'tight-tracking-headlines': {
    instruction: 'Large type is tracked tight; small uppercase labels are tracked wide. The contrast is what looks expensive.',
    prompt: '-0.04em at h1, -0.02em at h2-h3, +0.08em on uppercase micro-labels under 14px.',
  },
  'system-stack-fallback': {
    instruction: 'System font stacks only — zero network requests, zero layout shift, native rendering everywhere.',
    prompt: 'No @font-face, no Google Fonts. Always include at least three fallbacks per stack.',
  },
};

/* ------------------------------------------------------------------ colour */

export const COLOR_SKILLS = {
  'complementary-pop': {
    instruction: 'One dominant hue with its complement used only for emphasis, so the accent always means "act now".',
    hueOffset: 180, satBoost: 0.06,
  },
  'analogous-calm': {
    instruction: 'Neighbouring hues for a serene, cohesive palette; contrast comes from lightness, not from clashing colour.',
    hueOffset: 32, satBoost: -0.04,
  },
  'split-complementary': {
    instruction: 'Base hue plus the two hues either side of its complement — rich but not noisy, good for feature differentiation.',
    hueOffset: 150, satBoost: 0.02,
  },
  'monochrome-luxury': {
    instruction: 'A single hue family across a wide lightness range; exactly one accent, used once per viewport at most.',
    hueOffset: 0, satBoost: -0.08, monochrome: true,
  },
  'earth-natural': {
    instruction: 'Warm natural palette: clay, sand, olive, bark. Warm neutrals rather than cold greys, so nothing feels clinical.',
    hueOffset: 28, satBoost: -0.02, warmNeutrals: true,
  },
  'neon-cyber': {
    instruction: 'Deep near-black base with one or two electric accents. Never used for body text on light; the background stays dark.',
    hueOffset: 165, satBoost: 0.22, darkBase: true,
  },
  'pastel-dream': {
    instruction: 'Soft high-lightness pastels with one deep ink colour for text. Contrast is created by the ink, not the fills.',
    hueOffset: 200, satBoost: -0.12, highLightness: true,
  },
  'high-contrast-editorial': {
    instruction: 'Maximum contrast: near-black ink on paper white, one hot accent, no mid-tones. Nothing is subtle.',
    hueOffset: 200, satBoost: 0.14, monochrome: true,
  },
};

/* ------------------------------------------------------- space / shape / fx */

export const SPACE_SKILLS = {
  'space-scale': {
    instruction: 'All spacing comes from a single 4px-based scale, exposed as --space-1 through --space-12. No arbitrary pixel gaps.',
    prompt: '--space-1 4px, -2 8px, -3 12px, -4 16px, -5 24px, -6 32px, -7 48px, -8 64px, -9 96px, -10 128px',
  },
  'section-rhythm': {
    instruction: 'Section padding is a single clamp() token reused everywhere, so vertical rhythm is identical down the page.',
    prompt: '--section-y: clamp(64px, 8vw, 128px) desktop, clamp(48px, 12vw, 72px) mobile. Mobile overrides via media query, not a different token.',
  },
  'radius-scale': {
    instruction: 'Exactly one radius family is used across the whole site. If the archetype is 0, it is 0 everywhere.',
    prompt: '--radius-1..--radius-4 plus --radius-pill (999px). Nothing else.',
  },
  'elevation-ladder': {
    instruction: 'At most three shadow steps, tinted with the brand hue instead of pure black so they read as light, not dirt.',
    prompt: '0 1px 2px hsl(var(--brand-h) 30% 12% / .06), 0 8px 24px hsl(var(--brand-h) 30% 12% / .10), 0 24px 48px hsl(var(--brand-h) 30% 12% / .14)',
  },
  'noise-grain-overlay': {
    instruction: 'An extremely subtle grain overlay adds tactility and hides gradient banding.',
    prompt: 'Inline SVG feTurbulence as a data-URI background at 3-4% opacity, position: fixed, pointer-events: none, mix-blend-mode: overlay.',
  },
};

/* ------------------------------------------------------------------ motion */

export const MOTION_SKILLS = {
  'micro-interactions': {
    instruction: 'Every interactive element acknowledges input within 120-200ms: buttons press, links shift colour, inputs glow on focus.',
    prompt: 'transition: 180ms cubic-bezier(.2,.8,.2,1) on colour/transform/shadow for :hover, :active and :focus-visible.',
  },
  'scroll-reveal': {
    instruction:
      'Elements fade and rise into place as they enter the viewport, staggered so the page assembles itself. Disabled entirely under prefers-reduced-motion.',
    prompt: 'IntersectionObserver adding .is-visible; initial transform: translateY(16px), opacity 0; 60ms stagger via --i. Reduced motion sets opacity 1 / transform none with no transition.',
  },
  'hover-lift': {
    instruction: 'Cards and images lift a few pixels and deepen their shadow on hover, then settle back on pointer leave.',
    prompt: 'transform: translateY(-4px) plus a shadow step up, 200ms, transform-only.',
  },
  'marquee-ticker': {
    instruction: 'A seamlessly looping logo or word strip. The track is duplicated once and translated by exactly -50% so the loop is invisible.',
    prompt: '@keyframes marquee { to { transform: translateX(-50%) } } with the content duplicated; paused on hover; disabled under reduced motion.',
  },
  'count-up-stats': {
    instruction: 'Key numbers count up once when first scrolled into view, then stop. They never re-animate.',
    prompt: 'IntersectionObserver fires once, rAF loop over 1200ms with an easeOutCubic, aria-label set to the final value so screen readers get the number not the animation.',
  },
  'page-transition': {
    instruction: 'Route changes and the initial paint feel deliberate: a short fade-up on load, no heavy page transitions.',
    prompt: 'body fade-up on load via a single animation, 400ms max, transform/opacity only.',
  },
};

/* -------------------------------------------------------------- components */

export const COMPONENT_SKILLS = {
  'smart-nav': {
    instruction:
      'Sticky header that gains a blurred background and a bottom rule after 8px of scroll. Active section is highlighted via IntersectionObserver. On mobile a full-height drawer slides in from the right, traps focus, closes on Escape, on backdrop click and on link activation, and returns focus to the trigger. aria-expanded and aria-controls are wired to real state.',
    prompt:
      '<header class="site-header" data-nav> <button class="nav-toggle" aria-expanded="false" aria-controls="mobile-nav"> <nav id="mobile-nav" hidden> … </nav>. Toggle .is-open on the drawer, .is-scrolled on the header, .is-active on the current nav link.',
  },
  'hero-patterns': {
    instruction: 'The hero is one of: 7/5 split with an art panel, centred statement with a wide art band, full-bleed gradient with a bottom fade, or a bento grid of small cards. Pick one and commit — do not blend two.',
    prompt: 'h1 at clamp(2.5rem, 7vw, 5.5rem), max 12 words, subhead 1-125rem with max-width 52ch, primary + secondary CTA, then a 3-item trust row (rating, users, guarantee).',
  },
  'feature-grid': {
    instruction: 'Features as a 3-up (2-up, 4-up) grid of icon + title + one sentence + one outcome. Icons are inline SVG, one consistent 24px grid.',
    prompt: 'grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); card padding --space-5; icon 24px stroke 1.75 currentColor.',
  },
  'pricing-table': {
    instruction:
      'Two or three plans with a monthly/annual toggle that is a real button updating both prices and the aria-pressed state, plus a highlighted "most popular" plan that is only highlighted, never visually louder in text size.',
    prompt: 'Prices as data-price-monthly / data-price-annual attributes, toggled by class + aria-pressed; annual shows the discount honestly in words.',
  },
  'testimonial-cards': {
    instruction:
      'Two to three quotes with a real person: name, role, company, and a short specific result. One quote can be a larger pull-quote. No stock-photo avatars — use an initials SVG disc.',
    prompt: 'blockquote > p, then footer with a 40px initials avatar (inline SVG circle + text) and the attribution. Never invent a star rating without a stated source.',
  },
  'faq-accordion': {
    instruction:
      'Native <details>/<summary> is the default because it is accessible for free. Style the marker away, animate with grid-template-rows, and put a plus/minus SVG that flips.',
    prompt: '<details class="faq"><summary>Question<span class="faq-icon" aria-hidden="true"></span></summary><div>Answer</div></details>. Never aria-expanded on a details element.',
  },
  'logo-marquee': {
    instruction: 'A "trusted by" strip of wordmarks, drawn as inline SVG so nothing loads from the network.',
    prompt: 'Six to eight inline SVG wordmarks, all on the same optical baseline, --text-muted fill, 60% opacity rising to 100% on hover.',
  },
  'cta-band': {
    instruction: 'A full-width closing band with one strong CTA, one line of reassurance, and the primary brand colour as the background.',
    prompt: 'Primary background, --bg-coloured text (verified 4.5:1), 2 lines max, one button, optional secondary text link.',
  },
  'footer-4col': {
    instruction: 'Four link columns plus a brand column, then a legal row with real links, the year, and a privacy statement. Mobile collapses each column to a disclosure.',
    prompt: 'grid 2.2fr 1fr 1fr 1fr 1fr, collapsing to 1fr on mobile with <details> for the link columns.',
  },
  'contact-form': {
    instruction:
      'A contact or newsletter form that is fully real: required-field validation on submit, inline error messages tied with aria-describedby, aria-invalid on the field, a success state replacing the form, no network request, and a honeypot-free simple implementation.',
    prompt:
      'preventDefault on submit; validate name/email/message; error text in .field-error with id referenced by aria-describedby; on success replace the form with a confirmation panel and focus it.',
  },
  'stats-strip': {
    instruction: 'Three or four key numbers, big and tight, with a short label under each. No more — a stats strip is not a table.',
    prompt: 'Number at clamp(2rem, 5vw, 3.5rem) weight 800 tracking -0.03em, label 0.875rem uppercase 0.08em --text-muted.',
  },
  timeline: {
    instruction: 'A vertical or horizontal timeline of 4-5 steps with a connected rule, a dot per step, and a short paragraph each.',
    prompt: 'border-inline-start 2px --border on the list, dot as a positioned ::before, alternate left/right only above 900px.',
  },
  tabs: {
    instruction: 'Tabs as a real ARIA tablist with roving tabindex, arrow-key navigation, and panels whose hidden state is real.',
    prompt: 'role="tablist"/"tab"/"tabpanel", aria-selected, tabindex 0/-1, ArrowLeft/ArrowRight/Home/End handled, panel hidden attribute toggled.',
  },
  modal: {
    instruction: 'A dialog that traps focus, closes on Escape and backdrop click, restores focus to the trigger, and marks the rest of the page inert-ish via aria-hidden on the shell.',
    prompt: 'role="dialog" aria-modal="true" aria-labelledby, focus first focusable on open, Tab/Shift+Tab cycle inside, Escape closes, focus returns to opener.',
  },
  'cookie-banner': {
    instruction: 'Only if the site genuinely needs one. Dismissal persists in localStorage and the banner never re-appears after a choice.',
    prompt: 'Fixed bottom bar, two buttons, localStorage key namespaced to the brand, hidden on load when a choice exists.',
  },
};

/* ------------------------------------------------------------------- media */

export const MEDIA_SKILLS = {
  'css-illustration': {
    instruction: 'Imagery is generated, not downloaded: layered CSS gradients plus hand-written inline SVG shapes that match the palette.',
    prompt: 'Conic/radial gradient meshes, blurred gradient blobs behind a subject, inline SVG with hsl(var(--brand-h) …) fills.',
  },
  'gradient-mesh': {
    instruction: 'A soft multi-stop mesh background for hero and CTA sections, with an overlay that guarantees text contrast.',
    prompt: 'Two or three radial-gradients layered, plus a linear overlay at 40-60% to guarantee text contrast.',
  },
  'placeholder-portrait': {
    instruction: 'People are represented by initials discs — a brand-tinted circle with the person\'s initials, never a fake photograph.',
    prompt: 'Inline SVG 40px circle filled with a brand tint and centred initials at 0.8rem weight 700.',
  },
  'pattern-bg': {
    instruction: 'Subtle structure behind sections: a dot grid, a fine line grid, or a diagonal hatch, all at very low opacity.',
    prompt: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0) at 24px, opacity .05, or repeating-linear-gradient 45deg at 3%.',
  },
  'icon-set-cohesive': {
    instruction: 'One icon language only: 24px viewBox, 1.75px stroke, round caps and joins, no fills, no two-tone icons, no mixing icon styles.',
    prompt: '<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
  },
};

/* ------------------------------------------------------------------- trust */

export const TRUST_SKILLS = {
  'social-proof-strip': { instruction: 'A single "trusted by" line of wordmarks or a rating with a stated, checkable source, placed immediately under the hero.' },
  'case-study-block': { instruction: 'One deep case study with a real-shaped problem, approach and measurable outcome, rather than three shallow testimonials.' },
  'guarantee-badge': { instruction: 'A specific, believable guarantee (30-day, no-card, 99.9% uptime) rendered as a badge next to the CTA.' },
  'risk-reversal': { instruction: 'Answer the objection next to the buy button: what if it does not work, can I cancel, is my card safe.' },
  'urgency-banner': { instruction: 'Honest urgency only — a real deadline or a real capacity limit. Never a fake countdown timer or a fake "3 people viewing".' },
  'single-strong-cta': { instruction: 'One primary action per viewport, repeated with different context. Secondary actions are text links, never competing buttons.' },
};

export const SKILLS = {
  layout: LAYOUT_SKILLS,
  typography: TYPOGRAPHY_SKILLS,
  color: COLOR_SKILLS,
  space: SPACE_SKILLS,
  motion: MOTION_SKILLS,
  component: COMPONENT_SKILLS,
  media: MEDIA_SKILLS,
  trust: TRUST_SKILLS,
};

export const ALL_SKILL_IDS = Object.entries(SKILLS).flatMap(([group, set]) =>
  Object.keys(set).map((id) => ({ group, id })),
);

/** Conflicts: never select both members of a pair. */
export const CONFLICTS = [
  ['brutalist-raw', 'soft-organic'],
  ['brutalist-raw', 'minimal-luxury'],
  ['brutalist-raw', 'glassmorphism'],
  ['neo-brutal', 'minimal-luxury'],
  ['neo-brutal', 'glassmorphism'],
  ['minimal-luxury', 'maximalist-pop'],
  ['minimal-luxury', 'dashboard-dense'],
  ['swiss-grid', 'soft-organic'],
  ['editorial-magazine', 'dashboard-dense'],
  ['landing-conversion', 'editorial-magazine'],
];

export function isSkillId(id) {
  return ALL_SKILL_IDS.some((s) => s.id === id);
}

export function skillGroup(id) {
  return ALL_SKILL_IDS.find((s) => s.id === id)?.group ?? null;
}

export function conflictsWith(a, b) {
  return CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Resolves a skill set by removing conflicting members (first-wins, deterministic). */
export function resolveConflicts(ids) {
  const kept = [];
  const dropped = [];
  for (const id of ids) {
    if (kept.some((k) => conflictsWith(k, id))) {
      dropped.push(id);
      continue;
    }
    kept.push(id);
  }
  return { kept, dropped };
}

/**
 * Deterministic skill selection. Given the same brief it always returns the same
 * set, which keeps regeneration stable and makes the choice auditable.
 */
export function selectSkills({ archetype, brief = '', seed = 0, pageCount = 1 } = {}) {
  const layout = LAYOUT_SKILLS[archetype] ? archetype : 'landing-conversion';
  const ids = [layout];
  const h = stableHash(`${brief}|${seed}`);

  const briefLower = brief.toLowerCase();
  const wants = {
    editorial: /blog|article|news|magazine|journal|essay/.test(briefLower),
    dashboard: /dashboard|analytics|admin|metrics|charts|console/.test(briefLower),
    commerce: /pricing|shop|store|checkout|product|subscribe/.test(briefLower),
    portfolio: /portfolio|personal|resume|cv|freelance/.test(briefLower),
    docs: /docs|documentation|guide|reference|manual/.test(briefLower),
    motion: /playful|fun|animated|bold|energetic/.test(briefLower),
    luxury: /luxury|premium|elegant|refined|high-?end|minimal/.test(briefLower),
    techy: /ai|saas|developer|api|platform|startup|devtool/.test(briefLower),
  };

  // typography
  ids.push(wants.luxury || wants.editorial ? 'pair-serif-display' : 'pair-grotesk-body');
  ids.push('fluid-clamp-scale');
  ids.push('system-stack-fallback');
  if (wants.techy || wants.dashboard || layout === 'swiss-grid' || layout === 'brutalist-raw') ids.push('mono-accent');
  if (wants.luxury || layout === 'minimal-luxury' || layout === 'editorial-magazine') ids.push('tight-tracking-headlines');
  if (wants.editorial && pageCount > 1) ids.push('editorial-dropcap');

  // colour
  const colorMap = {
    luxury: 'monochrome-luxury',
    techy: 'neon-cyber',
    tech: 'neon-cyber',
    organic: 'earth-natural',
    natural: 'earth-natural',
    warm: 'earth-natural',
    pastel: 'pastel-dream',
    soft: 'pastel-dream',
    calm: 'analogous-calm',
    minimal: 'high-contrast-editorial',
    bold: 'complementary-pop',
    playful: 'pastel-dream',
    finance: 'monochrome-luxury',
  };
  let color = 'split-complementary';
  for (const [word, id] of Object.entries(colorMap)) {
    if (briefLower.includes(word)) { color = id; break; }
  }
  if (!/[a-z]/.test(briefLower)) color = 'split-complementary';
  ids.push(color);

  // space / shape
  ids.push('space-scale', 'section-rhythm', 'radius-scale');
  if (!['brutalist-raw', 'neo-brutal', 'swiss-grid'].includes(layout)) ids.push('elevation-ladder');
  if (['soft-organic', 'glassmorphism', 'maximalist-pop'].includes(layout)) ids.push('noise-grain-overlay');

  // motion
  ids.push('micro-interactions', 'hover-lift');
  if (pageCount > 1 || !wants.docs) ids.push('scroll-reveal');
  if (layout === 'maximalist-pop' || /social|community|trusted/.test(briefLower)) ids.push('marquee-ticker');
  if (wants.portfolio || wants.commerce || wants.editorial) ids.push('count-up-stats');
  if (!wants.docs) ids.push('page-transition');

  // components
  const always = ['smart-nav', 'hero-patterns', 'feature-grid', 'cta-band', 'footer-4col'];
  ids.push(...always);
  if (wants.commerce) ids.push('pricing-table', 'faq-accordion', 'risk-reversal');
  else ids.push('faq-accordion', 'testimonial-cards');
  if (wants.dashboard) ids.push('stats-strip', 'table', 'tabs');
  if (wants.editorial) ids.push('timeline');
  if (wants.docs) ids.push('tabs', 'modal');
  if (pageCount > 1) ids.push('contact-form');
  else ids.push('contact-form');
  if (wants.portfolio) ids.push('timeline');
  if (/event|webinar|launch|conf|summit/.test(briefLower)) ids.push('timeline', 'count-up-stats');

  // media
  ids.push('css-illustration', 'icon-set-cohesive');
  if (['soft-organic', 'glassmorphism', 'maximalist-pop', 'landing-conversion'].includes(layout)) ids.push('gradient-mesh');
  if (['brutalist-raw', 'neo-brutal', 'swiss-grid', 'dashboard-dense'].includes(layout)) ids.push('pattern-bg');
  if (wants.portfolio || briefLower.includes('testimonial') || briefLower.includes('team')) ids.push('placeholder-portrait');

  // trust
  ids.push('social-proof-strip');
  if (wants.commerce) ids.push('guarantee-badge', 'risk-reversal');
  if (wants.portfolio) ids.push('case-study-block');
  if (wants.editorial) ids.push('single-strong-cta');
  if (!wants.docs) ids.push('single-strong-cta');

  const { kept, dropped } = resolveConflicts([...new Set(ids)]);
  void h;
  return { skills: kept, dropped, layout, color, seed: h };
}

/** Renders a skill set into the instruction block injected into the page call. */
export function renderSkillBlock(skillIds) {
  const groups = new Map();
  for (const id of skillIds) {
    const group = skillGroup(id);
    const skill = SKILLS[group]?.[id];
    if (!group || !skill) continue;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ id, ...skill });
  }
  if (!groups.size) return '';
  const titles = {
    layout: 'LAYOUT ARCHETYPE',
    typography: 'TYPOGRAPHY',
    color: 'COLOUR',
    space: 'SPACE / SHAPE / DEPTH',
    motion: 'MOTION',
    component: 'COMPONENT BEHAVIOUR',
    media: 'IMAGERY & ICONS',
    trust: 'TRUST & CONVERSION',
  };
  const lines = [];
  for (const [group, list] of groups) {
    lines.push(`\n### ${titles[group] ?? group.toUpperCase()}`);
    for (const skill of list) {
      lines.push(`- [${skill.id}] ${skill.instruction}`);
      if (skill.prompt) lines.push(`  build: ${skill.prompt}`);
      if (skill.hueOffset !== undefined) {
        lines.push(`  colour maths: hue offset ${skill.hueOffset}deg, chroma ${skill.satBoost >= 0 ? '+' : ''}${skill.satBoost}${
          skill.monochrome ? ', single-hue' : ''
        }${skill.darkBase ? ', dark base' : ''}${skill.highLightness ? ', high lightness' : ''}${
          skill.warmNeutrals ? ', warm neutrals' : ''
        }`);
      }
    }
  }
  return lines.join('\n');
}

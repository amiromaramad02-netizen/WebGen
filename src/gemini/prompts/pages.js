import { selectSkills, renderSkillBlock } from '../../design/skills.js';
import { buildDesignContext } from '../../design/tokens.js';

function briefBlock(brief) {
  return `CLIENT BRIEF
"""
${brief}
"""`;
}

function planBlock(plan) {
  return `LOCKED SITE PLAN
${JSON.stringify(plan, null, 2)}`;
}

function siblingList(files, currentPath) {
  return files
    .filter((f) => f.path !== currentPath)
    .map((f) => `- ${f.path} (${f.kind})`)
    .join('\n');
}

/* ------------------------------------------------------------------ styles */

export function stylesPrompt({ brief, plan, design, analysis, skills }) {
  const ctx = buildDesignContext(design, skills);
  return `Write the ONE stylesheet for this entire site. Every page and every future file will rely on it, so it must be complete on its own.

${briefBlock(brief)}

${planBlock(plan)}

DESIGN SKILLS TO HONOUR
${renderSkillBlock(skills ?? ctx.skills)}

LOCKED TOKENS — copy this :root block exactly, then extend it. Do not rename, remove, or override any of these properties.
\`\`\`css
${ctx.cssVars}
\`\`\`

Contrast gate already verified by the system: ${ctx.audit.pass ? 'all token pairs pass' : 'REPAIRED automatically — keep the repaired values'}

NOW WRITE, in this order:

1. :root — the block above verbatim.
2. Reset — a modern, opinionated reset scoped to a .site class so nothing leaks. box-sizing, margin 0, media defaults, reduced-motion global.
3. Base — html/body using --bg/--text/--font-body, ::selection using --primary/--on-primary, :focus-visible ring with 2px --primary offset 2px.
4. Typography — body at --step-0 / --leading-body, h1..h6 from the --step ramp with --font-display, --weight-display, --tracking-display, and fluid sizes that never need a media query. Utility classes .eyebrow (mono, uppercase, 0.08em, --text-muted), .lede, .prose (max-width: var(--measure)), .muted.
5. Layout — .container (max-width: var(--container-max); padding-inline: var(--gutter); margin-inline: auto), .grid, .stack, .cluster, .section (padding-block: var(--section-y-mobile) and var(--section-y) above 640px), .grid-2, .grid-3, .split (7/5 asymmetric at >=900px, stacked below).
6. Components — every one of these, named exactly: .site-header (sticky, .is-scrolled state with backdrop-filter and a border), .nav-toggle (hidden >=900px), .mobile-nav (drawer, .is-open), .nav-link (.is-active), .btn, .btn-primary, .btn-secondary, .btn-ghost, .btn-lg, .card, .card-icon, .card-grid, .badge, .pill, .eyebrow, .hero, .hero-art, .hero-actions, .trust-row, .logo-marquee, .marquee-track, .stats, .stat, .stat-value, .stat-label, .feature, .feature-icon, .steps, .step, .timeline, .testimonial, .testimonial-card, .avatar, .quote, .pricing, .plan, .plan-popular, .price, .plan-toggle, .faq, .faq summary, .faq-icon, .cta-band, .site-footer, .footer-grid, .form, .field, .field-label, .field-input, .field-error, .form-success, .table, .tabs, .tab, .tabpanel, .modal, .is-open, .icon (24px, 1.75 stroke, currentColor), .reveal / .is-visible, .divider, .tag-list.
7. Illustrations — .art-*, .blob, .mesh, .pattern, .grain: CSS-gradient and inline-SVG art that uses only the tokens. No external images anywhere.
8. Responsive — every breakpoint needed so 360, 768, 1024, 1440 all look deliberate. Mobile-first.
9. [data-theme="dark"] — token remapping only, no component overrides.
10. @media (prefers-reduced-motion: reduce) — neutralise all animation, and make .reveal fully visible.

Requirements: no colour may appear as a raw hex or hsl in a component rule — tokens only. No !important except inside the reduced-motion block. No external url() except inline data-URI SVG. No @import. The file must end with a newline.

Return only the JSON object with "files": [{ "path": "styles.css", "content": "..." }].`;
}

/* ------------------------------------------------------------------ script */

export function scriptPrompt({ brief, plan, design, analysis, fileList }) {
  const features = new Set();
  for (const page of plan?.pages ?? []) for (const s of page.sections ?? []) features.add(s);
  const needed = [
    features.has('faq') ? 'FAQ — animate <details> open/close and rotate the marker' : null,
    features.has('pricing') ? 'pricing toggle — monthly/annual switch driven by data attributes, syncing aria-pressed' : null,
    features.has('tabs') ? 'tabs — full ARIA tablist with arrow/Home/End keys and roving tabindex' : null,
    features.has('contact') ? 'contact form — inline validation, aria-invalid, aria-describedby, success panel' : null,
    features.has('testimonials') ? 'testimonial carousel, if a carousel is used — keyboard + swipe + pause on hover' : null,
    features.has('stats') || features.has('timeline') || features.has('showcase')
      ? 'count-up for .stat-value, fired once via IntersectionObserver'
      : null,
  ].filter(Boolean);

  return `Write the ONE script for this entire site. Vanilla JS only, no libraries, no modules, no build step, under 8KB, IIFE-wrapped, strict mode.

${briefBlock(brief)}

${planBlock(plan)}

CLASSES THE STYLESHEET DEFINES (use these exact names)
- Header: .site-header (add .is-scrolled), .nav-toggle (aria-expanded, aria-controls), .mobile-nav (add .is-open)
- Nav: .nav-link (add .is-active), [data-section] targets for active-section highlighting
- Reveal: .reveal elements gain .is-visible
- Stats: .stat-value with data-target
- Pricing: .plan-toggle with aria-pressed, [data-price-monthly] / [data-price-annual]
- FAQ: .faq > details > summary, .faq-icon
- Forms: .form, .field, .field-input, .field-error, .form-success
- Tabs: [role="tablist"], [role="tab"], [role="tabpanel"]
- Modal: [data-modal-open], [data-modal-close], .modal
- Misc: .back-to-top, .theme-toggle (data-theme on <html>), .marquee-track, .copy[data-copy]

IMPLEMENT EXACTLY THESE, in priority order, and only those the site needs:
1. Smart nav: scroll listener (passive) toggling .is-scrolled past 8px; IntersectionObserver adding .is-active to the .nav-link whose [data-section] is in view; the mobile drawer — toggle aria-expanded, add .is-open, move focus into the drawer, trap Tab inside it, close on Escape, on backdrop click, and on link activation, and restore focus to .nav-toggle.
2. Scroll reveal: one IntersectionObserver for .reveal adding .is-visible, staggered by a --i custom property if present. Skip entirely if prefers-reduced-motion: reduce.
3. Count-up: animate .stat-value[data-target] from 0 once, 1200ms, easeOutCubic, and set the final value as the element's aria-label.
4. Pricing toggle, FAQ marker rotation, tabs (full keyboard support), modal (focus trap, Escape, focus restore), theme toggle persisted under a brand-namespaced localStorage key, copy-to-clipboard for [data-copy], back-to-top.
5. Marquee: duplicate the .marquee-track content once in JS and animate translateX(-50%) so the loop is seamless; skip under reduced motion.

HARD RULES
- 'use strict', single IIFE, no eval, no innerHTML, no document.write, no fetch, no network, no analytics.
- Every querySelector result is null-checked before use — a missing element must never throw.
- Every event listener is added once, and scroll/resize listeners are passive.
- No console.log left in the final file.
- Code must be complete: no truncated functions, no "...".

Return only the JSON object with "files": [{ "path": "app.js", "content": "..." }] and a one-line "notes".`;
}

/* -------------------------------------------------------------------- page */

export function pagePrompt({ brief, plan, design, analysis, skills, target, fileList, pageIndex = 0 }) {
  const ctx = buildDesignContext(design, skills);
  const page = plan?.pages?.[pageIndex] ?? {};
  const file = (plan?.files ?? []).find((f) => f.path === target.path);
  const isHome = target.path === 'index.html';
  const needsScript = (fileList ?? []).some((f) => f.path === 'app.js');

  return `Write ONE file: ${target.path}

${briefBlock(brief)}

${planBlock(plan)}

THIS FILE'S ASSIGNMENT
path: ${target.path}
kind: ${file?.kind ?? 'page'}
description: ${file?.description ?? 'The home page.'}
page title: ${page.title ?? (isHome ? plan?.brandName : target.path)}
sections, in order: ${(page.sections ?? []).join(', ') || 'hero, features, cta-band'}
primary CTA: ${page.primaryCta ?? 'the main action'}

LOCKED TOKENS — the stylesheet already defines these. Use them, do not redefine them.
\`\`\`css
${ctx.cssVars}
\`\`\`

DESIGN SKILLS TO HONOUR
${renderSkillBlock(skills ?? ctx.skills)}

SIBLING FILES (already written or about to be written — match their class names exactly)
${siblingList(fileList ?? [], target.path)}

NOW WRITE ${target.path}.

${isHome ? 'This is the home page and it carries the most weight. Structure it as a complete conversion surface.' : 'This is an interior page. It shares the header, footer and stylesheet with the home page, so repeat that markup exactly and change only the <main> content and the <title>/meta.'}

Mandatory structure:
1. <!doctype html>, <html lang="en">, <head> with:
   - the <style> containing ONLY page-specific rules that extend the shared stylesheet — the shared stylesheet is inlined into this same head by the build, so do NOT include a <link> to styles.css and do NOT paste the full :root here
   - <title>${page.title ?? plan?.brandName ?? 'Site'}</title>
   - <meta name="description"> (140-160 chars), <meta name="viewport" content="width=device-width, initial-scale=1">
   - Open Graph: og:title, og:description, og:type, og:image, og:url, og:site_name
   - Twitter: twitter:card, twitter:title, twitter:description, twitter:image
   - <link rel="icon" href="favicon.svg" type="image/svg+xml">, <link rel="manifest" href="site.webmanifest">
   - <link rel="canonical" href="https://example.com/${target.path}">
   - JSON-LD <script type="application/ld+json"> using the planned type
2. <body> containing, in order:
   - <a class="skip-link" href="#main">Skip to content</a>
   - <header class="site-header"> with the brand lockup, the desktop <nav aria-label="Primary"> whose links point to the real pages in the plan (other pages by their real filename, same-page sections as #slug), and .nav-toggle + .mobile-nav
   - <main id="main"> with one <section class="section"> per planned section, each with an id so nav links resolve
   - <footer class="site-footer">
3. The page's content is real: headline, subhead, and the actual sections listed for this page, each with specific copy for ${plan?.brandName ?? 'this brand'}. No lorem ipsum, no "Feature one" placeholders, no bracket notes.
4. Artwork is CSS/inline SVG using tokens — no <img> with an external src. If an <img> is genuinely the right element, it must be an inline data-URI SVG with width and height set.
5. Every CTA is a real link or a real button wired to something that happens. Forms get a .form with real client-side validation and a .form-success panel.
6. Exactly one <h1>. Heading levels never skip. Every section that nav links to has a matching id.
7. ${needsScript ? 'Behaviour comes from app.js, which is loaded by the build. Do NOT add an inline <script> for anything the shared script already does. Add an inline script only for something genuinely unique to this page, and keep it under 400 bytes.' : 'The build links app.js automatically; do not add a script tag.'}
8. No <script src>, no <link rel="stylesheet">, no external URL of any kind except the canonical/og:url which is metadata.

Return only the JSON object with "files": [{ "path": "${target.path}", "content": "..." }] and a one-line "notes".`;
}

/* ------------------------------------------------------------------- asset */

export function assetPrompt({ brief, plan, design, target }) {
  return `Write the asset file: ${target.path}

${briefBlock(brief)}

BRAND
name: ${plan?.brandName ?? 'the brand'}
description: ${plan?.tagline ?? ''}
palette: ${JSON.stringify(design?.palette ?? {}, null, 2)}

${target.description ?? 'A brand asset.'}

Requirements:
- Valid, complete, self-contained file. No comments. No external references of any kind.
- SVG: explicit viewBox, no fixed width/height (it must scale), no <script>, no external font, colours from the palette above, and it must look deliberate at 16px and at 1200px.
- robots.txt / site.webmanifest / sitemap.xml: correct MIME-friendly syntax, real absolute URLs on https://example.com, every page in the plan listed in the sitemap.
- og-image.svg: exactly 1200x630, brand background, brand name as converted-to-path-free <text> using generic families, tagline, and one geometric accent.

Return only the JSON object with "files": [{ "path": "${target.path}", "content": "..." }].`;
}

/* -------------------------------------------------------------------- edit */

export function editPrompt({ brief, plan, design, skills, instruction, fileList, currentFiles }) {
  const ctx = buildDesignContext(design, skills);
  const relevant = (currentFiles ?? [])
    .filter((f) => !/(^|\/)(app\.js|styles\.css)$/.test(f.path) || /index\.html$|\.html$/.test(f.path))
    .slice(0, 24);
  return `APPLY AN EDIT to an existing website. The user is describing a change, not asking for a rebuild.

ORIGINAL BRIEF
"""
${brief}
"""

CHANGE REQUESTED
"""
${instruction}
"""

SITE PLAN (do not violate the structure)
${JSON.stringify(plan ?? {}, null, 2)}

LOCKED TOKENS (the same :root block; do not rename or remove any property)
\`\`\`css
${ctx.cssVars}
\`\`\`

DESIGN SKILLS STILL IN FORCE
${renderSkillBlock(skills ?? ctx.skills)}

CURRENT FILES (${(currentFiles ?? []).length} total — the ones most likely to need changing are shown)
${(currentFiles ?? [])
    .map((f) => `- ${f.path} (${f.bytes} bytes)`)
    .join('\n')}

READ THESE FILES IN FULL BEFORE YOU DECIDE
${relevant
    .map((f) => `\n--- ${f.path} ---\n${f.content}`)
    .join('\n')}

RULES
- Return ONLY the files whose contents actually change. If the request needs nothing, return an empty changes array and explain why in "summary".
- Never rewrite a file merely to reformat it. Preserve the existing class names, ids and structure; the stylesheet and app.js depend on them.
- Any new markup must use the existing class vocabulary, or a new class that you also add to styles.css (return styles.css too when you do).
- Keep every hard requirement: responsive at 360px, accessible, working interactions, no external requests, no lorem ipsum.
- For style-only changes, edit styles.css only. For behaviour changes, edit app.js only. For copy or layout, edit the page.
- Full file contents, never diffs.

Return only the JSON object matching the schema.`;
}

import { SCHEMAS } from '../schema.js';
import { selectSkills, renderSkillBlock, SKILLS, SKILL_GROUPS } from '../../design/skills.js';

/* ----------------------------------------------------------------- analyze */

export function analyzePrompt(brief, options) {
  return `You are triaging a website request before any code is written.

BRIEF
"""
${brief}
"""

USER OPTIONS
${JSON.stringify(options ?? {}, null, 2)}

Decide and return JSON with these keys:
- "pageType": one of landing | multipage | portfolio | product | docs | ecommerce | event | agency | restaurant | blog | saas-app
- "industry": a specific industry label
- "brandName": the brand to use (use the user's if implied, otherwise invent one that fits)
- "mood": three to five words for the visual mood
- "archetype": exactly one id from this list, and no other value:
${Object.keys(SKILLS.layout).join(', ')}
- "audience": who the site is for
- "valueProp": the single sentence the site must land
- "mustHaveSections": 6-12 section slugs in order, chosen from:
  hero, logo-marquee, stats, problem, solution, features, how-it-works, showcase, case-study,
  testimonials, pricing, faq, contact, newsletter, cta-band, team, timeline, table, tabs
- "pages": 1-6 page paths, first MUST be index.html
- "callouts": 3-6 notes the writer must not forget (legal, factual, tone, constraint)
- "risks": anything likely to go wrong (needs real data, needs external imagery, ambiguous scope)

Return only the JSON object.`;
}

/* ------------------------------------------------------------------- plan */

export function planPrompt(brief, options, analysis) {
  const pages = analysis?.pages?.length ? analysis.pages : ['index.html'];
  return `Plan a complete static website.

BRIEF
"""
${brief}
"""

TRIAGE (already decided — build on it, do not re-litigate)
${JSON.stringify(analysis ?? {}, null, 2)}

USER OPTIONS
${JSON.stringify(options ?? {}, null, 2)}

Produce a plan with these files:
1. Every page: ${pages.join(', ')}
2. styles.css — ONE shared stylesheet for the whole site
3. app.js — ONE shared script for the whole site, under 8KB, no libraries
4. favicon.svg — a hand-written SVG mark derived from the brand initials
5. og-image.svg — a 1200x630 social card
6. robots.txt, sitemap.xml, site.webmanifest

Rules for the file list:
- index.html first, then the remaining pages, then styles.css, then app.js, then assets.
- Every path is root-relative and ends in .html for pages.
- "kind" is one of page | style | script | asset | seo | meta.
- "description" is one specific line: what goes in that file and what it must accomplish.
- Keep the total between 8 and 30 files. Fewer files with better content beats more files.
- "sections" entries must come from: hero, logo-marquee, stats, problem, solution, features, how-it-works, showcase, case-study, testimonials, pricing, faq, contact, newsletter, cta-band, team, timeline, table, tabs

Return only the JSON object matching the schema.`;
}

/* ----------------------------------------------------------------- design */

export function designPrompt(brief, plan, analysis, options) {
  const { skills, layout, color, dropped } = selectSkills({
    archetype: analysis?.archetype,
    brief: `${brief} ${options?.styleNotes ?? ''}`,
    pageCount: plan?.pages?.length ?? 1,
  });
  const skillBlock = renderSkillBlock(skills);
  const colorSkill = SKILLS.color[color] ?? {};
  return `Lock the design system for this site. Every later call uses your tokens verbatim, so they must be coherent and complete.

BRIEF
"""
${brief}
"""

SITE PLAN
${JSON.stringify(plan ?? {}, null, 2)}

TRIAGE
${JSON.stringify(analysis ?? {}, null, 2)}

ARCHETYPE (already chosen, do not change): ${layout}
${dropped.length ? `Conflicts resolved automatically, ignore these: ${dropped.join(', ')}\n` : ''}
COLOUR RECIPE: ${color} — ${colorSkill.instruction ?? ''}

DESIGN SKILLS YOU MUST HONOUR
${skillBlock}

Now return:
- palette: every colour as a hex string. The named colours are mandatory. textMuted must reach 4.5:1 on background AND on surface. primary must reach 3:1 on background for focus rings. Invent nothing outside the ramp.
- typography: display and body stacks must each name at least three fallbacks and must not require a network request. scale 1.200 | 1.250 | 1.414. baseSize 16-18. lineHeight 1.6-1.75. measure 60-75ch.
- space: base 4 or 8, sectionY and sectionYMobile as clamp(), gutter as clamp(), containerMax between 1080px and 1320px.
- shape: radiusScale of exactly 5 values, borderWidth 1-2 values, elevation of 3 or fewer shadow steps tinted with the brand hue instead of black.
- motion: duration 120-200ms, easing cubic-bezier(.2,.8,.2,1), techniques as a list of the skill ids you are actually using, and a reducedMotionStrategy that neutralises animation.
- cssVars: the complete :root block in field order, including [data-theme="dark"] overrides. No comments, no placeholders.
- rationale: two sentences on how this serves the brief.

Return only the JSON object matching the schema.`;
}

export { selectSkills, renderSkillBlock, SCHEMAS, SKILLS, SKILL_GROUPS };

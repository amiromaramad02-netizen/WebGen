/**
 * Response schemas handed to Gemini as `responseSchema`.
 * Gemini accepts an OpenAPI 3 subset: type/properties/required/items/enum/nullable/description.
 * Keep them small and flat — deeply nested schemas degrade adherence.
 */

const str = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
const num = (description) => ({ type: 'NUMBER', description });
const int = (description) => ({ type: 'INTEGER', description });
const bool = (description) => ({ type: 'BOOLEAN', description });
const arr = (items, description) => ({ type: 'ARRAY', description, items });
const enumOf = (values, description) => ({ type: 'STRING', description, enum: values });

export const SITE_PLAN_SCHEMA = {
  type: 'OBJECT',
  required: ['brandName', 'tagline', 'summary', 'audience', 'pages', 'files', 'sections', 'seo'],
  properties: {
    brandName: str('Invented or provided brand name, title case, 1-3 words.'),
    tagline: str('One line, max 90 chars, no trailing period.'),
    summary: str('Two or three sentences describing the finished site.'),
    audience: str('Who the site is for.'),
    toneOfVoice: str('Three adjectives describing the copy voice.'),
    pages: {
      type: 'ARRAY',
      description: '2-8 pages. First entry MUST be the home page.',
      items: {
        type: 'OBJECT',
        required: ['path', 'title', 'purpose', 'sections'],
        properties: {
          path: str('Root-relative path, always ends in .html, e.g. index.html'),
          title: str('Page <title> text, <= 60 chars.'),
          purpose: str('What this page achieves for the visitor.'),
          sections: arr(str('Section id, e.g. hero, features, pricing, faq'), 'Ordered section slugs for this page.'),
          primaryCta: str('Main call to action label on this page.'),
        },
      },
    },
    files: {
      type: 'ARRAY',
      description: 'Every file the site will contain, in write order. Home page first.',
      items: {
        type: 'OBJECT',
        required: ['path', 'kind'],
        properties: {
          path: str('e.g. index.html, styles.css, app.js, favicon.svg, sitemap.xml'),
          kind: enumOf(['page', 'style', 'script', 'asset', 'seo', 'meta'], 'What the file is.'),
          page: str('Which page this file belongs to, or "shared".'),
          description: str('One line describing exactly what to put in this file.'),
        },
      },
    },
    sections: arr(
      {
        type: 'OBJECT',
        required: ['slug', 'heading'],
        properties: {
          slug: str('e.g. hero'),
          heading: str('Real headline copy for the section.'),
          purpose: str('Why the section exists.'),
        },
      },
      'The distinct sections used across the site.',
    ),
    seo: {
      type: 'OBJECT',
      required: ['metaDescription', 'keywords', 'ogTitle', 'jsonLdType'],
      properties: {
        metaDescription: str('140-160 chars.'),
        keywords: arr(str('keyword'), '5-8 lowercase keywords.'),
        ogTitle: str('Social title.'),
        ogDescription: str('Social description.'),
        jsonLdType: enumOf(['Organization', 'LocalBusiness', 'Product', 'SoftwareApplication', 'Article', 'Person'], 'Most accurate JSON-LD type.'),
      },
    },
    accessibilityNotes: arr(str('note'), 'Known a11y decisions to honour.'),
  },
};

export const DESIGN_SYSTEM_SCHEMA = {
  type: 'OBJECT',
  required: ['archetype', 'mood', 'palette', 'typography', 'space', 'shape', 'motion', 'cssVars', 'rationale'],
  properties: {
    archetype: enumOf(
      [
        'editorial-magazine', 'swiss-grid', 'soft-organic', 'brutalist-raw', 'glassmorphism',
        'neo-brutal', 'minimal-luxury', 'maximalist-pop', 'dashboard-dense', 'landing-conversion',
      ],
      'Layout archetype to commit to.',
    ),
    skills: arr(str('skill id'), 'Design skill ids applied, from the provided library.'),
    mood: str('Three to five words describing the visual mood.'),
    palette: {
      type: 'OBJECT',
      required: ['seed', 'primary', 'primaryDark', 'accent', 'background', 'surface', 'text', 'textMuted', 'border', 'success', 'warning', 'danger'],
      properties: {
        seed: str('Human-readable description of the base hue.'),
        primary: str('Hex, e.g. #B45309'),
        primaryDark: str('Hex, hover/active state.'),
        primarySoft: str('Hex, tinted background.'),
        accent: str('Hex, used sparingly for emphasis.'),
        accent2: str('Hex, second accent.'),
        background: str('Hex page background.'),
        surface: str('Hex card/panel background.'),
        surfaceAlt: str('Hex secondary surface.'),
        text: str('Hex primary text.'),
        textMuted: str('Hex secondary text, must be >= 4.5:1 on background.'),
        border: str('Hex hairline border, >= 3:1 on its surface.'),
        success: str('Hex'), warning: str('Hex'), danger: str('Hex'),
        darkBackground: str('Hex dark-mode background.'),
        darkSurface: str('Hex dark-mode surface.'),
        darkText: str('Hex dark-mode text.'),
      },
    },
    typography: {
      type: 'OBJECT',
      required: ['display', 'body', 'displayWeight', 'bodyWeight', 'scale', 'baseSize', 'lineHeight'],
      properties: {
        display: str('CSS font-family stack for headings, quoted and with fallbacks.'),
        body: str('CSS font-family stack for body copy.'),
        mono: str('CSS font-family stack for code/eyebrows.'),
        displayWeight: int('400-900'),
        bodyWeight: int('400-700'),
        displayTracking: str('letter-spacing for large headings, e.g. -0.03em'),
        scale: num('1.200 | 1.250 | 1.414'),
        baseSize: num('16-18'),
        lineHeight: num('1.6-1.75'),
        measure: str('max width in ch for prose, 60-75ch.'),
      },
    },
    space: {
      type: 'OBJECT',
      required: ['base', 'sectionY', 'sectionYMobile', 'gutter'],
      properties: {
        base: int('4 or 8'),
        sectionY: str('clamp() value for desktop section padding, e.g. clamp(64px, 9vw, 128px)'),
        sectionYMobile: str('clamp() value for mobile section padding.'),
        gutter: str('clamp() container padding.'),
        containerMax: str('max-width, e.g. 1200px'),
      },
    },
    shape: {
      type: 'OBJECT',
      required: ['radiusScale', 'borderWidth'],
      properties: {
        radiusScale: arr(int('0-40'), 'e.g. [0, 6, 12, 20, 999]'),
        borderWidth: arr(str('e.g. 1px'), 'Border widths used.'),
        elevation: arr(str('box-shadow value'), '3 or fewer shadow steps.'),
      },
    },
    motion: {
      type: 'OBJECT',
      required: ['duration', 'easing', 'techniques'],
      properties: {
        duration: str('e.g. 180ms'),
        easing: str('cubic-bezier(...)'),
        techniques: arr(str('technique'), 'e.g. scroll-reveal, hover-lift, marquee-ticker'),
        reducedMotionStrategy: str('How motion is disabled under prefers-reduced-motion.'),
      },
    },
    cssVars: str('Complete :root custom-property block as one CSS string, including the colour ramps, spacing, type scale, radii and shadows. No comments.'),
    rationale: str('Two sentences on why these choices serve the brief.'),
  },
};

export const PAGE_FILE_SCHEMA = {
  type: 'OBJECT',
  required: ['files'],
  properties: {
    files: {
      type: 'ARRAY',
      description: 'Exactly the files you were asked to write, in order.',
      items: {
        type: 'OBJECT',
        required: ['path', 'content'],
        properties: {
          path: str('Root-relative path, e.g. index.html'),
          content: str('Complete file contents. No markdown fences, no truncation, no comments describing the code.'),
        },
      },
    },
    notes: str('One short sentence: anything the next file must know.'),
  },
};

export const EDIT_SCHEMA = {
  type: 'OBJECT',
  required: ['summary', 'changes'],
  properties: {
    summary: str('One line describing what changed, in plain English.'),
    changes: {
      type: 'ARRAY',
      description: 'Only files whose contents actually change.',
      items: {
        type: 'OBJECT',
        required: ['path', 'content'],
        properties: {
          path: str('Root-relative path of an existing file.'),
          content: str('Full new contents of that file, not a diff.'),
          reason: str('Why this file had to change.'),
        },
      },
    },
    assets: {
      type: 'ARRAY',
      description: 'Optional new binary-safe text assets (svg, css, json).',
      items: {
        type: 'OBJECT',
        required: ['path', 'content'],
        properties: { path: str('path'), content: str('contents') },
      },
    },
  },
};

export const REPAIR_SCHEMA = {
  type: 'OBJECT',
  required: ['files', 'fixesApplied'],
  properties: {
    files: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['path', 'content'],
        properties: {
          path: str('The file being fixed.'),
          content: str('Corrected complete contents.'),
        },
      },
    },
    fixesApplied: arr(str('description of each fix'), 'What you changed and why.'),
  },
};

export const COPY_SCHEMA = {
  type: 'OBJECT',
  required: ['pages'],
  properties: {
    pages: arr(
      {
        type: 'OBJECT',
        required: ['path', 'title', 'metaDescription', 'headings'],
        properties: {
          path: str('page path'),
          title: str('<title>'),
          metaDescription: str('meta description'),
          headings: arr(str('h1/h2 text'), 'Ordered headings for the page.'),
        },
      },
      'SEO metadata for every page.',
    ),
    jsonLd: str('A complete JSON-LD object as a JSON string.'),
  },
};

export const SCHEMAS = {
  plan: SITE_PLAN_SCHEMA,
  design: DESIGN_SYSTEM_SCHEMA,
  page: PAGE_FILE_SCHEMA,
  edit: EDIT_SCHEMA,
  repair: REPAIR_SCHEMA,
  seo: COPY_SCHEMA,
};

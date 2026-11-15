export interface MdxValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TocHeading {
  depth: number;
  text: string;
  slug: string;
}

const ALLOWED_COMPONENTS = new Set(['Callout', 'Figure']);

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /^\s*import\s+/m, message: 'Statements "import" are not allowed in CMS MDX.' },
  { pattern: /^\s*export\s+/m, message: 'Statements "export" are not allowed in CMS MDX.' },
  { pattern: /<\s*script\b/i, message: 'Tag <script> is forbidden.' },
  { pattern: /<\s*iframe\b/i, message: 'Tag <iframe> is forbidden.' },
  { pattern: /<\s*object\b/i, message: 'Tag <object> is forbidden.' },
  { pattern: /<\s*embed\b/i, message: 'Tag <embed> is forbidden.' },
  { pattern: /<\s*style\b/i, message: 'Tag <style> is forbidden.' },
  { pattern: /\bon[a-z]+\s*=/i, message: 'Inline event handlers (onClick, onload, etc.) are forbidden.' },
  { pattern: /javascript\s*:/i, message: 'javascript: URLs are forbidden.' },
  { pattern: /vbscript\s*:/i, message: 'vbscript: URLs are forbidden.' },
];

/**
 * Strips fenced code blocks and inline code spans so code examples
 * inside articles do not trigger false positives during MDX validation.
 */
function stripCodeRegions(source: string): string {
  const withoutFences = source.replace(/^```[\s\S]*?^```/gm, '').replace(/^~~~[\s\S]*?^~~~/gm, '');
  return withoutFences.replace(/`[^`\n]+`/g, '');
}

/**
 * Validates restricted MDX content according to the PRD security trust model:
 * - No ESM imports/exports
 * - No arbitrary JSX expressions `{...}` outside code blocks
 * - No raw HTML script/iframe/event-handler injections
 * - Only allowlisted custom MDX components (`Callout`, `Figure`)
 */
export function validateRestrictedMdx(source: string): MdxValidationResult {
  const errors: string[] = [];
  const stripped = stripCodeRegions(source);

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(stripped)) {
      errors.push(rule.message);
    }
  }

  // Disallow arbitrary JSX expressions `{...}` outside code blocks
  if (/\{[^}]*\}/.test(stripped)) {
    errors.push('Arbitrary JSX expressions "{...}" are not permitted in restricted MDX mode.');
  }

  // Check PascalCase JSX tags against explicit allowlist
  const jsxTagRegex = /<\/?\s*([A-Z][A-Za-z0-9_]*)\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = jsxTagRegex.exec(stripped)) !== null) {
    const tagName = match[1];
    if (!ALLOWED_COMPONENTS.has(tagName)) {
      errors.push(`Component <${tagName}> is not in the permitted allowlist (Callout, Figure).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
  };
}

export function estimateReadingTimeMinutes(source: string): number {
  const plainText = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>\-[\]()!]/g, ' ');
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function headingToSlug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractHeadingsFromMdx(source: string): TocHeading[] {
  const withoutFences = source.replace(/^```[\s\S]*?^```/gm, '');
  const headings: TocHeading[] = [];
  const seen = new Map<string, number>();

  for (const line of withoutFences.split(/\r?\n/)) {
    const match = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const depth = match[1].length;
    const rawText = match[2].replace(/[`*_[\]]/g, '').trim();
    if (!rawText) continue;
    const baseSlug = headingToSlug(rawText) || 'section';
    const count = seen.get(baseSlug) || 0;
    seen.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    headings.push({ depth, text: rawText, slug });
  }

  return headings;
}

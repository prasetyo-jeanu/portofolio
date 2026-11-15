import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { codeToHtml } from 'shiki';
import { validateRestrictedMdx } from './validator';

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function transformAllowedComponents(source: string): string {
  let output = source.replace(
    /<Callout([^>]*)>([\s\S]*?)<\/Callout>/g,
    (_m, attrStr: string, inner: string) => {
      const attrs = parseAttributes(attrStr);
      const type = ['info', 'warning', 'tip', 'danger'].includes(attrs.type) ? attrs.type : 'info';
      const title = attrs.title ? `<p class="callout-title"><strong>${escapeHtml(attrs.title)}</strong></p>` : '';
      return `<div class="mdx-callout mdx-callout-${type}" data-callout="${type}">${title}\n\n${inner.trim()}\n\n</div>`;
    },
  );

  output = output.replace(/<Figure([^>]*)\/?>/g, (_m, attrStr: string) => {
    const attrs = parseAttributes(attrStr);
    const src = escapeHtml(attrs.src || '');
    const alt = escapeHtml(attrs.alt || '');
    const caption = attrs.caption ? `<figcaption>${escapeHtml(attrs.caption)}</figcaption>` : '';
    return `<figure class="mdx-figure"><img src="${src}" alt="${alt}" loading="lazy" />${caption}</figure>`;
  });

  return output;
}

export async function renderSafeMdxPreview(source: string): Promise<{
  html: string;
  errors: string[];
}> {
  const validation = validateRestrictedMdx(source);
  if (!validation.valid) {
    return { html: '', errors: validation.errors };
  }

  const transformed = transformAllowedComponents(source);
  const codeBlocks: Array<{ placeholder: string; html: string }> = [];
  let blockIndex = 0;

  const marked = new Marked({
    gfm: true,
    breaks: false,
  });

  const withPlaceholders = transformed.replace(
    /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g,
    (_m, lang: string, code: string) => {
      const placeholder = `<!--SHIKI_BLOCK_${blockIndex++}-->`;
      codeBlocks.push({ placeholder, html: JSON.stringify({ lang: lang || 'text', code }) });
      return placeholder;
    },
  );

  const rawHtml = await marked.parse(withPlaceholders);

  let cleanHtml = sanitizeHtml(rawHtml, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'blockquote', 'ul', 'ol', 'li',
      'strong', 'em', 'del', 'code', 'pre', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'figure', 'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'loading'],
      div: ['class', 'data-callout'],
      p: ['class'],
      figure: ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  });

  for (const item of codeBlocks) {
    const parsed = JSON.parse(item.html) as { lang: string; code: string };
    let highlighted: string;
    try {
      highlighted = await codeToHtml(parsed.code.trimEnd(), {
        lang: parsed.lang || 'text',
        theme: 'github-dark-default',
      });
    } catch {
      highlighted = `<pre><code>${escapeHtml(parsed.code.trimEnd())}</code></pre>`;
    }
    cleanHtml = cleanHtml.replace(item.placeholder, highlighted);
  }

  return { html: cleanHtml, errors: [] };
}

/**
 * @fileoverview Content Extraction service layer.
 *
 * Provides URL content extraction, YouTube transcript retrieval,
 * Wikipedia article extraction, PDF text extraction, and structured
 * data extraction via CSS selectors.
 */

import axios, { AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UrlExtractionResult {
  url: string;
  title: string;
  content: string;
  format: string;
  wordCount: number;
  metadata: {
    description?: string;
    author?: string;
    publishedDate?: string;
    siteName?: string;
  };
}

export interface YouTubeExtractionResult {
  videoId: string;
  title: string;
  author: string;
  transcript: string;
  duration?: string;
  metadata: {
    channelUrl?: string;
    thumbnail?: string;
    description?: string;
  };
}

export interface WikipediaExtractionResult {
  title: string;
  content: string;
  summary: string;
  url: string;
  language: string;
  metadata: {
    description?: string;
    thumbnail?: string;
    lastModified?: string;
    categories?: string[];
  };
}

export interface PdfExtractionResult {
  url: string;
  content: string;
  pageCount?: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
  };
}

export interface StructuredExtractionResult {
  url: string;
  title: string;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  lists: string[][];
  metadata: Record<string, string>;
  links: Array<{ text: string; href: string }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContentExtractionService {
  private httpClient: AxiosInstance;
  private running = false;

  constructor() {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: { 'User-Agent': 'AgentOS-ContentExtraction/0.1.0' },
    });
  }

  async initialize(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── URL Extraction ──

  async extractUrl(url: string, format: string = 'text'): Promise<UrlExtractionResult> {
    this.requireRunning();

    const response = await this.httpClient.get(url, {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 15000,
    });

    const html = response.data as string;
    const title = this.extractTitle(html);
    const meta = this.extractMetaTags(html);
    const rawContent = this.htmlToText(html);

    let content: string;
    switch (format) {
      case 'markdown':
        content = this.htmlToMarkdown(html);
        break;
      case 'html':
        content = this.extractMainContent(html);
        break;
      case 'text':
      default:
        content = rawContent;
        break;
    }

    return {
      url,
      title,
      content,
      format,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      metadata: {
        description: meta['description'],
        author: meta['author'],
        publishedDate: meta['article:published_time'] ?? meta['date'],
        siteName: meta['og:site_name'],
      },
    };
  }

  // ── YouTube Extraction ──

  async extractYouTube(videoIdOrUrl: string): Promise<YouTubeExtractionResult> {
    this.requireRunning();

    const videoId = this.parseYouTubeId(videoIdOrUrl);

    // Fetch video metadata via oEmbed
    const oembed = await this.httpClient.get(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );

    // Attempt to fetch transcript via YouTube's timedtext API
    let transcript = '';
    try {
      // Fetch the video page to extract caption track URL
      const pageRes = await this.httpClient.get(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'Accept-Language': 'en-US,en;q=0.9' },
      });
      const pageHtml = pageRes.data as string;

      // Extract captions from the page data
      const captionMatch = pageHtml.match(/"captions":\s*(\{[\s\S]*?"playerCaptionsTracklistRenderer"[\s\S]*?\})\s*,\s*"/);
      if (captionMatch) {
        const captionData = captionMatch[1];
        const urlMatch = captionData.match(/"baseUrl"\s*:\s*"([^"]+)"/);
        if (urlMatch) {
          const captionUrl = urlMatch[1].replace(/\\u0026/g, '&');
          const captionRes = await this.httpClient.get(captionUrl);
          const captionXml = captionRes.data as string;
          // Extract text from XML caption format
          const textSegments = captionXml.match(/<text[^>]*>([\s\S]*?)<\/text>/g) ?? [];
          transcript = textSegments
            .map((seg) => seg.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
            .join(' ')
            .trim();
        }
      }
    } catch {
      transcript = '(Transcript not available)';
    }

    return {
      videoId,
      title: oembed.data.title ?? '',
      author: oembed.data.author_name ?? '',
      transcript: transcript || '(Transcript not available)',
      metadata: {
        channelUrl: oembed.data.author_url,
        thumbnail: oembed.data.thumbnail_url,
      },
    };
  }

  // ── Wikipedia Extraction ──

  async extractWikipedia(title: string, language: string = 'en'): Promise<WikipediaExtractionResult> {
    this.requireRunning();

    const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));

    // Fetch summary via REST API
    const summaryRes = await this.httpClient.get(
      `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`,
    );
    const summary = summaryRes.data;

    // Fetch full content via MediaWiki API
    const contentRes = await this.httpClient.get(
      `https://${language}.wikipedia.org/w/api.php`,
      {
        params: {
          action: 'query',
          titles: title,
          prop: 'extracts|categories|revisions',
          explaintext: true,
          exlimit: 1,
          rvprop: 'timestamp',
          format: 'json',
        },
      },
    );

    const pages = contentRes.data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;
    const fullContent = page?.extract ?? summary.extract ?? '';
    const categories = (page?.categories ?? []).map((c: any) => c.title?.replace('Category:', '') ?? '');
    const lastModified = page?.revisions?.[0]?.timestamp;

    return {
      title: summary.title ?? title,
      content: fullContent,
      summary: summary.extract ?? '',
      url: summary.content_urls?.desktop?.page ?? `https://${language}.wikipedia.org/wiki/${encodedTitle}`,
      language,
      metadata: {
        description: summary.description,
        thumbnail: summary.thumbnail?.source,
        lastModified,
        categories,
      },
    };
  }

  // ── PDF Extraction ──

  async extractPdf(url: string): Promise<PdfExtractionResult> {
    this.requireRunning();

    const response = await this.httpClient.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    const content = this.extractTextFromPdfBuffer(buffer);

    // Try to extract basic PDF metadata
    const pdfString = buffer.toString('latin1');
    const titleMatch = pdfString.match(/\/Title\s*\(([^)]*)\)/);
    const authorMatch = pdfString.match(/\/Author\s*\(([^)]*)\)/);
    const subjectMatch = pdfString.match(/\/Subject\s*\(([^)]*)\)/);

    // Count pages
    const pageCountMatch = pdfString.match(/\/Type\s*\/Page[^s]/g);
    const pageCount = pageCountMatch?.length;

    return {
      url,
      content,
      pageCount,
      metadata: {
        title: titleMatch?.[1],
        author: authorMatch?.[1],
        subject: subjectMatch?.[1],
      },
    };
  }

  // ── Structured Extraction ──

  async extractStructured(
    url: string,
    selectors?: Record<string, string>,
  ): Promise<StructuredExtractionResult> {
    this.requireRunning();

    const response = await this.httpClient.get(url, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      timeout: 15000,
    });

    const html = response.data as string;
    const title = this.extractTitle(html);

    // Extract tables
    const tables = this.extractTables(html);

    // Extract lists
    const lists = this.extractLists(html);

    // Extract metadata from meta tags
    const metadata = this.extractMetaTags(html);

    // Extract links
    const links = this.extractLinks(html);

    return { url, title, tables, lists, metadata, links };
  }

  // ── Private: HTML Processing ──

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
  }

  private extractMetaTags(html: string): Record<string, string> {
    const meta: Record<string, string> = {};
    const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:name|property)\s*=\s*["']([^"']+)["']\s+(?:[^>]*?\s+)?content\s*=\s*["']([^"']*)["'][^>]*>/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      meta[match[1].toLowerCase()] = match[2];
    }
    // Also handle content-first meta tags
    const altRegex = /<meta\s+(?:[^>]*?\s+)?content\s*=\s*["']([^"']*)["']\s+(?:[^>]*?\s+)?(?:name|property)\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((match = altRegex.exec(html)) !== null) {
      meta[match[2].toLowerCase()] = match[1];
    }
    return meta;
  }

  private extractMainContent(html: string): string {
    // Try to extract main/article content
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) return articleMatch[1];

    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) return mainMatch[1];

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch?.[1] ?? html;
  }

  private htmlToText(html: string): string {
    const mainHtml = this.extractMainContent(html);
    return mainHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private htmlToMarkdown(html: string): string {
    const mainHtml = this.extractMainContent(html);
    return mainHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n')
      .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n')
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
      .replace(/<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<img\s+[^>]*src\s*=\s*["']([^"']*)["'][^>]*alt\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private extractTables(html: string): Array<{ headers: string[]; rows: string[][] }> {
    const tables: Array<{ headers: string[]; rows: string[][] }> = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1];

      // Extract headers
      const headers: string[] = [];
      const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let thMatch;
      while ((thMatch = thRegex.exec(tableHtml)) !== null) {
        headers.push(thMatch[1].replace(/<[^>]+>/g, '').trim());
      }

      // Extract rows
      const rows: string[][] = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(tableHtml)) !== null) {
        const cells: string[] = [];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
          cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
        }
        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (headers.length > 0 || rows.length > 0) {
        tables.push({ headers, rows });
      }
    }

    return tables;
  }

  private extractLists(html: string): string[][] {
    const lists: string[][] = [];
    const listRegex = /<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi;
    let listMatch;

    while ((listMatch = listRegex.exec(html)) !== null) {
      const items: string[] = [];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liRegex.exec(listMatch[1])) !== null) {
        items.push(liMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      if (items.length > 0) {
        lists.push(items);
      }
    }

    return lists;
  }

  private extractLinks(html: string): Array<{ text: string; href: string }> {
    const links: Array<{ text: string; href: string }> = [];
    const linkRegex = /<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      const text = match[2].replace(/<[^>]+>/g, '').trim();
      if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({ text, href });
      }
    }

    return links.slice(0, 100); // Limit to 100 links
  }

  // ── Private: PDF Processing ──

  private extractTextFromPdfBuffer(buffer: Buffer): string {
    // Basic PDF text extraction without external dependencies.
    // Handles common text stream encodings (uncompressed streams).
    const pdfStr = buffer.toString('latin1');
    const textParts: string[] = [];

    // Extract text from uncompressed streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamRegex.exec(pdfStr)) !== null) {
      const streamContent = match[1];
      // Look for text operations: Tj (show string), TJ (show strings), ' and " operators
      const textOps = streamContent.match(/\(([^)]*)\)\s*Tj/g) ?? [];
      for (const op of textOps) {
        const textMatch = op.match(/\(([^)]*)\)/);
        if (textMatch) {
          textParts.push(textMatch[1]);
        }
      }

      // Handle TJ arrays
      const tjArrays = streamContent.match(/\[([\s\S]*?)\]\s*TJ/g) ?? [];
      for (const arr of tjArrays) {
        const strings = arr.match(/\(([^)]*)\)/g) ?? [];
        const line = strings.map((s) => s.slice(1, -1)).join('');
        if (line.trim()) {
          textParts.push(line);
        }
      }
    }

    if (textParts.length === 0) {
      return '(PDF text extraction requires uncompressed text streams. For compressed PDFs, consider using a dedicated PDF library.)';
    }

    return textParts.join('\n').trim();
  }

  // ── Private: YouTube Helpers ──

  private parseYouTubeId(input: string): string {
    // Accept full URL or plain video ID
    const urlMatch = input.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    if (urlMatch) return urlMatch[1];
    // If it looks like just an ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    return input;
  }

  private requireRunning(): void {
    if (!this.running) throw new Error('ContentExtractionService not initialized');
  }
}

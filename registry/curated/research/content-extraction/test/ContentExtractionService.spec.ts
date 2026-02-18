import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentExtractionService } from '../src/ContentExtractionService';

// ---------------------------------------------------------------------------
// Mock axios
// ---------------------------------------------------------------------------

const mockGet = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      get: (...args: any[]) => mockGet(...args),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentExtractionService', () => {
  let service: ContentExtractionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new ContentExtractionService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  // ── Constructor / Lifecycle ──

  describe('constructor', () => {
    it('should create service with default config', () => {
      const svc = new ContentExtractionService();
      expect(svc.isRunning).toBe(false);
    });
  });

  describe('initialize / shutdown', () => {
    it('should set isRunning to true after initialize', () => {
      expect(service.isRunning).toBe(true);
    });

    it('should set isRunning to false after shutdown', async () => {
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  describe('requireRunning', () => {
    it('should throw when calling extractUrl before initialization', async () => {
      const svc = new ContentExtractionService();
      await expect(svc.extractUrl('https://example.com')).rejects.toThrow('not initialized');
    });

    it('should throw when calling extractYouTube before initialization', async () => {
      const svc = new ContentExtractionService();
      await expect(svc.extractYouTube('abc12345678')).rejects.toThrow('not initialized');
    });

    it('should throw when calling extractWikipedia before initialization', async () => {
      const svc = new ContentExtractionService();
      await expect(svc.extractWikipedia('Test')).rejects.toThrow('not initialized');
    });

    it('should throw when calling extractPdf before initialization', async () => {
      const svc = new ContentExtractionService();
      await expect(svc.extractPdf('https://example.com/doc.pdf')).rejects.toThrow('not initialized');
    });

    it('should throw when calling extractStructured before initialization', async () => {
      const svc = new ContentExtractionService();
      await expect(svc.extractStructured('https://example.com')).rejects.toThrow('not initialized');
    });
  });

  // ── extractUrl ──

  describe('extractUrl', () => {
    const sampleHtml = `
      <html>
        <head>
          <title>Test Article</title>
          <meta name="description" content="A test article description">
          <meta name="author" content="John Doe">
          <meta property="og:site_name" content="TestSite">
        </head>
        <body>
          <article>
            <h1>Test Heading</h1>
            <p>This is the article content with some words here.</p>
          </article>
        </body>
      </html>
    `;

    it('should extract text content from a URL', async () => {
      mockGet.mockResolvedValue({ data: sampleHtml });

      const result = await service.extractUrl('https://example.com/article', 'text');
      expect(result.url).toBe('https://example.com/article');
      expect(result.title).toBe('Test Article');
      expect(result.format).toBe('text');
      expect(result.content).toContain('Test Heading');
      expect(result.content).toContain('article content');
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should extract metadata from HTML', async () => {
      mockGet.mockResolvedValue({ data: sampleHtml });

      const result = await service.extractUrl('https://example.com/article');
      expect(result.metadata.description).toBe('A test article description');
      expect(result.metadata.author).toBe('John Doe');
      expect(result.metadata.siteName).toBe('TestSite');
    });

    it('should return markdown format when requested', async () => {
      const htmlWithFormatting = `
        <html><head><title>MD Test</title></head>
        <body>
          <article>
            <h1>Main Title</h1>
            <p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>
            <a href="https://link.com">A link</a>
          </article>
        </body></html>
      `;
      mockGet.mockResolvedValue({ data: htmlWithFormatting });

      const result = await service.extractUrl('https://example.com', 'markdown');
      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Main Title');
      expect(result.content).toContain('**bold**');
      expect(result.content).toContain('*italic*');
    });

    it('should return HTML format when requested', async () => {
      mockGet.mockResolvedValue({ data: sampleHtml });

      const result = await service.extractUrl('https://example.com', 'html');
      expect(result.format).toBe('html');
      // HTML format extracts the main article content
      expect(result.content).toContain('<h1>Test Heading</h1>');
    });

    it('should default to text format', async () => {
      mockGet.mockResolvedValue({ data: sampleHtml });

      const result = await service.extractUrl('https://example.com');
      expect(result.format).toBe('text');
    });

    it('should strip script and style tags from text output', async () => {
      const htmlWithScripts = `
        <html><head><title>T</title></head>
        <body>
          <script>alert('xss')</script>
          <style>.hidden { display: none }</style>
          <main><p>Clean content</p></main>
        </body></html>
      `;
      mockGet.mockResolvedValue({ data: htmlWithScripts });

      const result = await service.extractUrl('https://example.com', 'text');
      expect(result.content).not.toContain('alert');
      expect(result.content).not.toContain('display: none');
      expect(result.content).toContain('Clean content');
    });
  });

  // ── extractYouTube ──

  describe('extractYouTube', () => {
    it('should extract YouTube video metadata from full URL', async () => {
      // First call: oEmbed
      mockGet.mockResolvedValueOnce({
        data: {
          title: 'Test Video Title',
          author_name: 'TestChannel',
          author_url: 'https://youtube.com/@TestChannel',
          thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg',
        },
      });
      // Second call: video page for transcript
      mockGet.mockResolvedValueOnce({
        data: '<html>No captions data here</html>',
      });

      const result = await service.extractYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
      expect(result.title).toBe('Test Video Title');
      expect(result.author).toBe('TestChannel');
      expect(result.metadata.channelUrl).toBe('https://youtube.com/@TestChannel');
    });

    it('should accept plain video ID', async () => {
      mockGet.mockResolvedValueOnce({
        data: { title: 'Video', author_name: 'Author' },
      });
      mockGet.mockResolvedValueOnce({ data: '<html></html>' });

      const result = await service.extractYouTube('dQw4w9WgXcQ');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('should handle missing transcript gracefully', async () => {
      mockGet.mockResolvedValueOnce({
        data: { title: 'Video', author_name: 'Author' },
      });
      mockGet.mockRejectedValueOnce(new Error('Page not available'));

      const result = await service.extractYouTube('abc12345678');
      expect(result.transcript).toBe('(Transcript not available)');
    });

    it('should parse youtu.be short URL', async () => {
      mockGet.mockResolvedValueOnce({
        data: { title: 'Short URL Video', author_name: 'Channel' },
      });
      mockGet.mockResolvedValueOnce({ data: '<html></html>' });

      const result = await service.extractYouTube('https://youtu.be/abc12345678');
      expect(result.videoId).toBe('abc12345678');
    });
  });

  // ── extractWikipedia ──

  describe('extractWikipedia', () => {
    it('should extract Wikipedia article content', async () => {
      // First call: summary API
      mockGet.mockResolvedValueOnce({
        data: {
          title: 'Machine Learning',
          extract: 'Machine learning (ML) is a type of artificial intelligence...',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Machine_learning' } },
          description: 'Branch of AI',
          thumbnail: { source: 'https://upload.wikimedia.org/thumb.jpg' },
        },
      });
      // Second call: full content API
      mockGet.mockResolvedValueOnce({
        data: {
          query: {
            pages: {
              '12345': {
                extract: 'Full article text about machine learning...',
                categories: [{ title: 'Category:Machine learning' }],
                revisions: [{ timestamp: '2024-01-15T00:00:00Z' }],
              },
            },
          },
        },
      });

      const result = await service.extractWikipedia('Machine learning');
      expect(result.title).toBe('Machine Learning');
      expect(result.content).toContain('machine learning');
      expect(result.summary).toContain('Machine learning');
      expect(result.language).toBe('en');
      expect(result.url).toContain('wikipedia.org');
      expect(result.metadata.description).toBe('Branch of AI');
      expect(result.metadata.categories).toContain('Machine learning');
    });

    it('should support different languages', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          title: 'Apprentissage automatique',
          extract: 'L apprentissage automatique...',
          content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Apprentissage_automatique' } },
        },
      });
      mockGet.mockResolvedValueOnce({
        data: { query: { pages: { '1': { extract: 'Full text' } } } },
      });

      const result = await service.extractWikipedia('Apprentissage automatique', 'fr');
      expect(result.language).toBe('fr');
    });

    it('should handle missing full content gracefully', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          title: 'Test Article',
          extract: 'Summary only',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Test' } },
        },
      });
      mockGet.mockResolvedValueOnce({
        data: { query: { pages: {} } },
      });

      const result = await service.extractWikipedia('Test');
      // Should fall back to summary extract
      expect(result.summary).toBe('Summary only');
    });
  });

  // ── extractPdf ──

  describe('extractPdf', () => {
    it('should extract text from uncompressed PDF buffer', async () => {
      // Create a minimal mock PDF with text operators
      const pdfContent = '%PDF-1.4\nstream\n(Hello World) Tj\nendstream\n/Type /Page ';
      const buffer = Buffer.from(pdfContent, 'latin1');
      mockGet.mockResolvedValue({ data: buffer });

      const result = await service.extractPdf('https://example.com/doc.pdf');
      expect(result.url).toBe('https://example.com/doc.pdf');
      expect(result.content).toContain('Hello World');
    });

    it('should extract PDF metadata (title, author, subject)', async () => {
      const pdfContent = '%PDF-1.4\n/Title (Test Document)\n/Author (Jane Doe)\n/Subject (Testing)\nstream\n(Content) Tj\nendstream\n/Type /Page ';
      const buffer = Buffer.from(pdfContent, 'latin1');
      mockGet.mockResolvedValue({ data: buffer });

      const result = await service.extractPdf('https://example.com/doc.pdf');
      expect(result.metadata.title).toBe('Test Document');
      expect(result.metadata.author).toBe('Jane Doe');
      expect(result.metadata.subject).toBe('Testing');
    });

    it('should handle compressed PDFs with fallback message', async () => {
      // No text operators in streams
      const pdfContent = '%PDF-1.4\nstream\ncompressed binary data\nendstream';
      const buffer = Buffer.from(pdfContent, 'latin1');
      mockGet.mockResolvedValue({ data: buffer });

      const result = await service.extractPdf('https://example.com/compressed.pdf');
      expect(result.content).toContain('PDF text extraction requires');
    });

    it('should count pages', async () => {
      const pdfContent = '%PDF-1.4\n/Type /Page \n/Type /Page \nstream\n(text) Tj\nendstream';
      const buffer = Buffer.from(pdfContent, 'latin1');
      mockGet.mockResolvedValue({ data: buffer });

      const result = await service.extractPdf('https://example.com/multi.pdf');
      expect(result.pageCount).toBe(2);
    });

    it('should handle TJ array text operators', async () => {
      const pdfContent = '%PDF-1.4\nstream\n[(Hello ) -10 (World)] TJ\nendstream\n/Type /Page ';
      const buffer = Buffer.from(pdfContent, 'latin1');
      mockGet.mockResolvedValue({ data: buffer });

      const result = await service.extractPdf('https://example.com/tj-array.pdf');
      expect(result.content).toContain('Hello');
      expect(result.content).toContain('World');
    });
  });

  // ── extractStructured ──

  describe('extractStructured', () => {
    it('should extract tables from HTML', async () => {
      const html = `
        <html><head><title>Data Page</title></head>
        <body>
          <table>
            <tr><th>Name</th><th>Age</th></tr>
            <tr><td>Alice</td><td>30</td></tr>
            <tr><td>Bob</td><td>25</td></tr>
          </table>
        </body></html>
      `;
      mockGet.mockResolvedValue({ data: html });

      const result = await service.extractStructured('https://example.com/data');
      expect(result.url).toBe('https://example.com/data');
      expect(result.title).toBe('Data Page');
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].headers).toEqual(['Name', 'Age']);
      expect(result.tables[0].rows).toEqual([['Alice', '30'], ['Bob', '25']]);
    });

    it('should extract lists from HTML', async () => {
      const html = `
        <html><head><title>Lists</title></head>
        <body>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
          </ul>
          <ol>
            <li>First</li>
            <li>Second</li>
          </ol>
        </body></html>
      `;
      mockGet.mockResolvedValue({ data: html });

      const result = await service.extractStructured('https://example.com/lists');
      expect(result.lists).toHaveLength(2);
      expect(result.lists[0]).toEqual(['Item 1', 'Item 2', 'Item 3']);
      expect(result.lists[1]).toEqual(['First', 'Second']);
    });

    it('should extract links from HTML', async () => {
      const html = `
        <html><head><title>Links</title></head>
        <body>
          <a href="https://example.com/page1">Page 1</a>
          <a href="https://example.com/page2">Page 2</a>
          <a href="#section">Internal</a>
          <a href="javascript:void(0)">JS link</a>
        </body></html>
      `;
      mockGet.mockResolvedValue({ data: html });

      const result = await service.extractStructured('https://example.com/links');
      // Should exclude # and javascript: links
      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toEqual({ text: 'Page 1', href: 'https://example.com/page1' });
    });

    it('should extract meta tags', async () => {
      const html = `
        <html><head>
          <title>Meta Page</title>
          <meta name="description" content="A page with metadata">
          <meta property="og:title" content="OG Title">
        </head><body></body></html>
      `;
      mockGet.mockResolvedValue({ data: html });

      const result = await service.extractStructured('https://example.com/meta');
      expect(result.metadata['description']).toBe('A page with metadata');
      expect(result.metadata['og:title']).toBe('OG Title');
    });

    it('should handle page with no tables or lists', async () => {
      const html = '<html><head><title>Empty</title></head><body><p>Just text</p></body></html>';
      mockGet.mockResolvedValue({ data: html });

      const result = await service.extractStructured('https://example.com/empty');
      expect(result.tables).toEqual([]);
      expect(result.lists).toEqual([]);
    });

    it('should limit links to 100', async () => {
      const links = Array.from({ length: 150 }, (_, i) =>
        `<a href="https://example.com/${i}">Link ${i}</a>`
      ).join('\n');
      const html = `<html><head><title>Many Links</title></head><body>${links}</body></html>`;
      mockGet.mockResolvedValue({ data: html });

      const result = await service.extractStructured('https://example.com/many-links');
      expect(result.links.length).toBeLessThanOrEqual(100);
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    it('should propagate HTTP errors from extractUrl', async () => {
      mockGet.mockRejectedValue(new Error('Network timeout'));
      await expect(service.extractUrl('https://unreachable.com')).rejects.toThrow('Network timeout');
    });

    it('should propagate HTTP errors from extractPdf', async () => {
      mockGet.mockRejectedValue(new Error('404 Not Found'));
      await expect(service.extractPdf('https://example.com/missing.pdf')).rejects.toThrow('404 Not Found');
    });
  });
});

import { request } from 'undici';
import { convert } from 'html-to-text';
import { URL } from 'url';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext } from './base.js';
import { ToolOutputEvent } from '../events/EventTypes.js';

interface WebSearchSource {
  title: string;
  url: string;
  content?: string;
}

interface WebSearchResult {
  summary: string;
  sources: WebSearchSource[];
  success: boolean;
  error?: string;
}

interface UrlFetchResult {
  content: string;
  title?: string;
  truncated: boolean;
  success: boolean;
  error?: string;
}

interface TavilyResponse {
  answer: string;
  query: string;
  follow_up_questions?: string[];
  images?: string[];
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
}

const isPrivateOrLocalUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return true;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const localHostnames = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      'ip6-localhost',
      'ip6-loopback'
    ];

    if (localHostnames.includes(hostname)) {
      return true;
    }

    const privateIpPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^224\./,
      /^240\./,
      /^0\./,
      /^127\./,
      /^255\.255\.255\.255$/,
      /^::1$/,
      /^fe80:/i,
      /^fc00:/i,
      /^fd00:/i
    ];

    for (const pattern of privateIpPatterns) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      const parts = hostname.split('.').map(Number);
      if (parts.some(part => part > 255 || part < 0)) {
        return true;
      }
      if (parts[0] === 0 ||
        parts[0] === 127 ||
        (parts[0] === 169 && parts[1] === 254) ||
        parts[0] >= 224) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return true;
  }
};

const truncateContent = (content: string, maxLength: number): { content: string; truncated: boolean } => {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }
  return {
    content: content.substring(0, maxLength) + '\n\n[Content truncated due to length]',
    truncated: true
  };
};

export const createWebSearchTool = (context: ToolContext) => tool({
  description: 'Search the web for current information using Tavily AI. Returns a summary and relevant sources.',
  inputSchema: z.object({
    query: z.string().describe('The search query to execute')
  }),
  execute: async ({ query }): Promise<WebSearchResult> => {
    try {
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
          summary: '',
          sources: [],
          success: false,
          error: 'Search query cannot be empty'
        };
      }

      if (!context.config.tools.tavilyApiKey) {
        return {
          summary: '',
          sources: [],
          success: false,
          error: 'Web search functionality is disabled. Please add "tavilyApiKey" field to config file ~/.tempurai/config.json to enable this functionality. You can get a free API Key at https://tavily.com.'
        };
      }

      context.eventEmitter.emit({
        type: 'tool_output',
        toolName: 'web_search',
        content: `Searching the web for: "${query}"`
      } as ToolOutputEvent);

      const response = await request('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: context.config.tools.tavilyApiKey,
          query: query.trim(),
          search_depth: 'basic',
          include_answer: true,
          include_images: false,
          include_raw_content: false,
          max_results: 5
        })
      });

      if (response.statusCode !== 200) {
        return {
          summary: '',
          sources: [],
          success: false,
          error: `Tavily API request failed: HTTP ${response.statusCode}`
        };
      }

      const data = await response.body.json() as TavilyResponse;

      const sources: WebSearchSource[] = data.results.map(result => ({
        title: result.title,
        url: result.url,
        content: result.content
      }));

      const searchResults = `Web search results for "${query}":
Summary: ${data.answer || 'No relevant information found'}
Sources:
${sources.map((source, i) => `${i + 1}. ${source.title} - ${source.url}`).join('\n')}`;

      context.eventEmitter.emit({
        type: 'tool_output',
        toolName: 'web_search',
        content: searchResults
      } as ToolOutputEvent);

      return {
        summary: data.answer || 'No relevant information found',
        sources,
        success: true
      };
    } catch (error) {
      return {
        summary: '',
        sources: [],
        success: false,
        error: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});

export const createUrlFetchTool = (context: ToolContext) => tool({
  description: 'Fetch and extract text content from a web URL. Includes security checks to prevent access to private networks.',
  inputSchema: z.object({
    url: z.string().describe('The URL to fetch content from')
  }),
  execute: async ({ url }): Promise<UrlFetchResult> => {
    const webToolsConfig = context.config.tools.webTools;
    const requestTimeout = webToolsConfig.requestTimeout ?? 15000;
    const maxContentLength = webToolsConfig.maxContentLength ?? 10000;
    const userAgent = webToolsConfig.userAgent ?? 'Tempurai-Bot/1.0 (Security-Enhanced)';

    try {
      if (!url || typeof url !== 'string') {
        return {
          content: '',
          success: false,
          truncated: false,
          error: 'Invalid URL parameter'
        };
      }

      if (isPrivateOrLocalUrl(url)) {
        return {
          content: '',
          success: false,
          truncated: false,
          error: 'Access to local or private network addresses is prohibited for security reasons. This restriction prevents Server-Side Request Forgery (SSRF) attacks.'
        };
      }

      context.eventEmitter.emit({
        type: 'tool_output',
        toolName: 'url_fetch',
        content: `Fetching content from: ${url}`
      } as ToolOutputEvent);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, requestTimeout);

      let html: string;
      let title: string | undefined;

      try {
        const response = await request(url, {
          method: 'GET',
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
          },
          signal: controller.signal,
          headersTimeout: requestTimeout,
          bodyTimeout: requestTimeout
        });

        clearTimeout(timeoutId);

        if (response.statusCode !== 200) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `HTTP request failed: ${response.statusCode} - ${response.statusCode === 403 ? 'Access denied' : response.statusCode === 404 ? 'Page not found' : response.statusCode === 500 ? 'Internal server error' : 'Request failed'}`
          };
        }

        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength as string) > maxContentLength * 2) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `Response content too large (${contentLength} bytes), exceeds safety limit. Please try accessing a smaller page.`
          };
        }

        html = await response.body.text();
        if (html.length > maxContentLength * 3) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `Web page content too large (${html.length} characters), exceeds processing limit. Please try accessing a smaller page.`
          };
        }
      } catch (requestError) {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `Request timeout (${requestTimeout}ms). Website response time too long, please try again later.`
          };
        }

        const error = requestError as Error;
        if (error.message.includes('ENOTFOUND')) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: 'DNS resolution failed, please check if URL is correct.'
          };
        }
        if (error.message.includes('ECONNREFUSED')) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: 'Connection refused, target server may be unavailable.'
          };
        }
        throw requestError;
      }

      const textContent = convert(html, {
        wordwrap: 80,
        selectors: [
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
          { selector: 'header', format: 'skip' },
          { selector: '.advertisement', format: 'skip' },
          { selector: '.ads', format: 'skip' },
          { selector: 'h1', format: 'heading' },
          { selector: 'h2', format: 'heading' },
          { selector: 'h3', format: 'heading' },
          { selector: 'h4', format: 'heading' },
          { selector: 'p', format: 'paragraph' },
          { selector: 'ul', format: 'unorderedList' },
          { selector: 'ol', format: 'orderedList' },
          { selector: 'li', format: 'listItem' },
          { selector: 'code', format: 'inline' },
          { selector: 'pre', format: 'block' },
          { selector: 'blockquote', format: 'blockquote' }
        ]
      });

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : undefined;

      const { content: finalContent, truncated } = truncateContent(textContent, maxContentLength);

      const fetchResults = `Content fetched from ${url}:
${title ? `Title: ${title}` : ''}
Content length: ${finalContent.length} characters${truncated ? ' (truncated)' : ''}
${finalContent.split('\n').slice(0, 10).join('\n')}${finalContent.split('\n').length > 10 ? '\n...[content continues]' : ''}`;

      context.eventEmitter.emit({
        type: 'tool_output',
        toolName: 'url_fetch',
        content: fetchResults
      } as ToolOutputEvent);

      return {
        content: finalContent,
        title,
        success: true,
        truncated
      };
    } catch (error) {
      return {
        content: '',
        success: false,
        truncated: false,
        error: `Failed to fetch URL content: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});
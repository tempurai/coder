import { request } from 'undici';
import { convert } from 'html-to-text';
import { URL } from 'url';
import { z } from 'zod';
import { tool } from 'ai';
import { Config } from '../config/ConfigLoader.js';

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
    content: content.substring(0, maxLength) + '\n\n[...内容因过长已被截断]',
    truncated: true
  };
};

export const createWebSearchTool = (config: Config) => tool({
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
          error: '搜索查询不能为空'
        };
      }

      if (!config.tools.tavilyApiKey) {
        return {
          summary: '',
          sources: [],
          success: false,
          error: 'Web 搜索功能已禁用。请在配置文件 ~/.tempurai/config.json 中添加 "tavilyApiKey" 字段以启用此功能。您可以在 https://tavily.com 获取免费的 API Key。'
        };
      }

      const response = await request('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: config.tools.tavilyApiKey,
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
          error: `Tavily API 请求失败: HTTP ${response.statusCode}`
        };
      }

      const data = await response.body.json() as TavilyResponse;
      const sources: WebSearchSource[] = data.results.map(result => ({
        title: result.title,
        url: result.url,
        content: result.content
      }));

      return {
        summary: data.answer || '未找到相关信息',
        sources,
        success: true
      };
    } catch (error) {
      return {
        summary: '',
        sources: [],
        success: false,
        error: `搜索出错: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
});

export const createUrlFetchTool = (config: Config) => tool({
  description: 'Fetch and extract text content from a web URL. Includes security checks to prevent access to private networks.',
  inputSchema: z.object({
    url: z.string().describe('The URL to fetch content from')
  }),
  execute: async ({ url }): Promise<UrlFetchResult> => {
    const webToolsConfig = config.tools.webTools;
    const requestTimeout = webToolsConfig.requestTimeout ?? 15000;
    const maxContentLength = webToolsConfig.maxContentLength ?? 10000;
    const userAgent = webToolsConfig.userAgent ?? 'Tempurai-Bot/1.0 (Security-Enhanced)';

    try {
      if (!url || typeof url !== 'string') {
        return {
          content: '',
          success: false,
          truncated: false,
          error: 'URL 参数无效'
        };
      }

      if (isPrivateOrLocalUrl(url)) {
        return {
          content: '',
          success: false,
          truncated: false,
          error: '出于安全原因，禁止访问本地或私有网络地址。此限制可防止 Server-Side Request Forgery (SSRF) 攻击。'
        };
      }

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
            error: `HTTP 请求失败: ${response.statusCode} - ${response.statusCode === 403 ? '访问被拒绝' : response.statusCode === 404 ? '页面未找到' : response.statusCode === 500 ? '服务器内部错误' : '请求失败'}`
          };
        }

        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength as string) > maxContentLength * 2) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `响应内容过大 (${contentLength} 字节)，超过安全限制。请尝试访问较小的页面。`
          };
        }

        html = await response.body.text();
        if (html.length > maxContentLength * 3) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `网页内容过大 (${html.length} 字符)，超过处理限制。请尝试访问较小的页面。`
          };
        }
      } catch (requestError) {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `请求超时 (${requestTimeout}ms)。网站响应时间过长，请稍后重试。`
          };
        }
        const error = requestError as Error;
        if (error.message.includes('ENOTFOUND')) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: '域名解析失败，请检查 URL 是否正确。'
          };
        }
        if (error.message.includes('ECONNREFUSED')) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: '连接被拒绝，目标服务器可能不可用。'
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
        error: `获取 URL 内容失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
});
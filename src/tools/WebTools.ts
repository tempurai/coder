import { request } from 'undici';
import { convert } from 'html-to-text';
import { URL } from 'url';
import { ConfigLoader, Config } from '../config/ConfigLoader';

/**
 * Web 搜索结果中的单个来源
 */
interface WebSearchSource {
  /** 页面标题 */
  title: string;
  /** 页面 URL */
  url: string;
  /** 简短描述或摘录 */
  content?: string;
}

/**
 * Web 搜索工具的返回结果
 */
interface WebSearchResult {
  /** 搜索查询的直接答案总结 */
  summary: string;
  /** 相关的来源链接 */
  sources: WebSearchSource[];
  /** 是否成功执行搜索 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * URL 获取工具的返回结果
 */
interface UrlFetchResult {
  /** 提取的文本内容 */
  content: string;
  /** 页面标题 */
  title?: string;
  /** 内容是否被截断 */
  truncated: boolean;
  /** 是否成功获取 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * Tavily API 响应结构
 */
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

/**
 * 检查 URL 是否指向私有或本地网络地址
 * 这是一个关键的安全函数，用于防止 Server-Side Request Forgery (SSRF) 攻击
 * 
 * @param url 要检查的 URL 字符串
 * @returns true 如果 URL 指向私有/本地地址，false 如果 URL 是安全的公网地址
 * 
 * @security
 * 此函数阻止访问以下危险地址：
 * - 本地回环地址 (localhost, 127.0.0.1, ::1)
 * - 私有网络地址 (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
 * - 链路本地地址 (169.254.x.x)
 * - 多播地址 (224.x.x.x, 240.x.x.x)
 * - 非 HTTP/HTTPS 协议 (file://, ftp://, etc.)
 */
const isPrivateOrLocalUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    
    // 只允许 HTTP 和 HTTPS 协议
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return true; // 非 HTTP/HTTPS 协议被视为不安全
    }
    
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // 检查本地回环地址
    const localHostnames = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',         // IPv6 本地回环
      'ip6-localhost',
      'ip6-loopback'
    ];
    
    if (localHostnames.includes(hostname)) {
      return true;
    }
    
    // 使用更严格的正则表达式检查私有 IP 地址段
    const privateIpPatterns = [
      /^10\./,                                    // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./,           // 172.16.0.0/12
      /^192\.168\./,                              // 192.168.0.0/16
      /^169\.254\./,                              // 链路本地地址 169.254.0.0/16
      /^224\./,                                   // 多播地址 224.0.0.0/4
      /^240\./,                                   // 保留地址 240.0.0.0/4
      /^0\./,                                     // 0.0.0.0/8 当前网络
      /^127\./,                                   // 127.0.0.0/8 回环地址
      /^255\.255\.255\.255$/,                     // 广播地址
      /^::1$/,                                    // IPv6 回环
      /^fe80:/i,                                  // IPv6 链路本地
      /^fc00:/i,                                  // IPv6 唯一本地地址
      /^fd00:/i                                   // IPv6 唯一本地地址
    ];
    
    // 检查是否匹配任何私有 IP 模式
    for (const pattern of privateIpPatterns) {
      if (pattern.test(hostname)) {
        return true;
      }
    }
    
    // 检查是否是纯 IP 地址但可能绕过上面的检查
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      const parts = hostname.split('.').map(Number);
      
      // 额外检查一些边界情况
      if (parts.some(part => part > 255 || part < 0)) {
        return true; // 无效的 IP 地址
      }
      
      // 检查更多私有地址范围
      if (parts[0] === 0 ||                      // 0.x.x.x
          parts[0] === 127 ||                    // 127.x.x.x
          (parts[0] === 169 && parts[1] === 254) || // 169.254.x.x
          parts[0] >= 224) {                     // 224.x.x.x 及以上
        return true;
      }
    }
    
    return false; // URL 被认为是安全的
  } catch (error) {
    // 如果 URL 解析失败，视为不安全
    return true;
  }
};

/**
 * 检查 URL 是否安全可访问（向后兼容的包装函数）
 * @deprecated 请使用 isPrivateOrLocalUrl 以获得更清晰的语义
 */
const isUrlSafe = (urlString: string): boolean => {
  return !isPrivateOrLocalUrl(urlString);
};

/**
 * 最大内容长度常量 - 防止过大的响应内容消耗过多内存和 LLM 上下文
 */
const MAX_CONTENT_LENGTH = 10000;

/**
 * HTTP 请求超时时间（毫秒）
 */
const HTTP_REQUEST_TIMEOUT = 15000;

/**
 * 截断文本内容到指定长度
 * @param content 原始内容
 * @param maxLength 最大长度，默认使用 MAX_CONTENT_LENGTH
 * @returns 截断后的内容和是否被截断的标志
 */
const truncateContent = (content: string, maxLength: number = MAX_CONTENT_LENGTH): { content: string; truncated: boolean } => {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }
  
  return {
    content: content.substring(0, maxLength) + '\n\n[...内容因过长已被截断]',
    truncated: true
  };
};

/**
 * Web 搜索工具 - 使用 Tavily AI 进行智能搜索
 * 创建 Web 搜索工具实例，使用提供的配置
 */
export const createWebSearchTool = (config: Config) => ({
  id: 'web_search',
  name: 'web_search',
  description: 'Search the web for current information using Tavily AI. Returns a summary and relevant sources.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to execute'
      }
    },
    required: ['query']
  },
  
  /**
   * 执行 web 搜索
   * @param params 包含 query 的参数对象
   * @returns Promise<WebSearchResult> 搜索结果
   */
  async execute(params: { query: string }): Promise<WebSearchResult> {
    try {
      const { query } = params;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
          summary: '',
          sources: [],
          success: false,
          error: '搜索查询不能为空'
        };
      }
      
      // 使用传入的配置获取 Tavily API Key
      const apiKey = config.tavilyApiKey;
      
      if (!apiKey) {
        return {
          summary: '',
          sources: [],
          success: false,
          error: 'Web 搜索功能已禁用。请在配置文件 ~/.temurai/config.json 中添加 "tavilyApiKey" 字段以启用此功能。您可以在 https://tavily.com 获取免费的 API Key。'
        };
      }
      
      // 调用 Tavily API
      const response = await request('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: apiKey,
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
      
      // 构建搜索结果
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

/**
 * 向后兼容的 web 搜索工具
 * @deprecated 建议使用 createWebSearchTool(config) 代替
 */
export const webSearchTool = createWebSearchTool({} as Config);

/**
 * URL 获取工具 - 安全地获取并提取网页内容
 * 创建 URL 获取工具实例，使用提供的配置
 */
export const createUrlFetchTool = (config: Config) => ({
  id: 'url_fetch',
  name: 'url_fetch',
  description: 'Fetch and extract text content from a web URL. Includes security checks to prevent access to private networks.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch content from'
      }
    },
    required: ['url']
  },
  
  /**
   * 安全地获取 URL 内容
   * @param params 包含 url 的参数对象
   * @returns Promise<UrlFetchResult> 获取结果
   */
  async execute(params: { url: string }): Promise<UrlFetchResult> {
    try {
      const { url } = params;
      
      if (!url || typeof url !== 'string') {
        return {
          content: '',
          success: false,
          truncated: false,
          error: 'URL 参数无效'
        };
      }
      
      // 关键安全验证 - 防止 SSRF 攻击
      if (isPrivateOrLocalUrl(url)) {
        return {
          content: '',
          success: false,
          truncated: false,
          error: '出于安全原因，禁止访问本地或私有网络地址。此限制可防止 Server-Side Request Forgery (SSRF) 攻击。'
        };
      }
      
      // 创建 AbortController 用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, HTTP_REQUEST_TIMEOUT);

      let html: string;
      let title: string | undefined;

      try {
        // 获取网页内容，带超时控制
        const response = await request(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Tempurai-Bot/1.0 (Security-Enhanced)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
          },
          // 使用 AbortController 进行超时控制
          signal: controller.signal,
          // 设置较短的连接超时
          headersTimeout: HTTP_REQUEST_TIMEOUT,
          bodyTimeout: HTTP_REQUEST_TIMEOUT
        });
        
        // 清除超时定时器
        clearTimeout(timeoutId);
        
        if (response.statusCode !== 200) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `HTTP 请求失败: ${response.statusCode} - ${response.statusCode === 403 ? '访问被拒绝' : response.statusCode === 404 ? '页面未找到' : response.statusCode === 500 ? '服务器内部错误' : '请求失败'}`
          };
        }

        // 检查响应内容长度
        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength as string) > MAX_CONTENT_LENGTH * 2) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `响应内容过大 (${contentLength} 字节)，超过安全限制。请尝试访问较小的页面。`
          };
        }

        html = await response.body.text();
        
        // 检查实际内容长度
        if (html.length > MAX_CONTENT_LENGTH * 3) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `网页内容过大 (${html.length} 字符)，超过处理限制。请尝试访问较小的页面。`
          };
        }

      } catch (requestError) {
        // 清除超时定时器
        clearTimeout(timeoutId);
        
        // 处理不同类型的请求错误
        if (controller.signal.aborted) {
          return {
            content: '',
            success: false,
            truncated: false,
            error: `请求超时 (${HTTP_REQUEST_TIMEOUT}ms)。网站响应时间过长，请稍后重试。`
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
        
        throw requestError; // 重新抛出其他未处理的错误
      }
      
      // 转换 HTML 为文本
      const textContent = convert(html, {
        wordwrap: 80,
        selectors: [
          // 移除脚本和样式内容
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
          { selector: 'header', format: 'skip' },
          { selector: '.advertisement', format: 'skip' },
          { selector: '.ads', format: 'skip' },
          // 保留重要内容
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
      
      // 提取页面标题
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : undefined;
      
      // 截断内容以防止过长
      const { content: finalContent, truncated } = truncateContent(textContent);
      
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

/**
 * 向后兼容的 URL 获取工具
 * @deprecated 建议使用 createUrlFetchTool(config) 代替
 */
export const urlFetchTool = createUrlFetchTool({} as Config);
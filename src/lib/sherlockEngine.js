import fs from 'fs';
import path from 'path';

// Load site data
let siteDataCache = null;

export function getSiteData() {
  if (siteDataCache) return siteDataCache;
  try {
    const filePath = path.join(process.cwd(), 'src', 'lib', 'sherlock_data.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    
    // Clean up $schema or meta keys
    const sites = {};
    for (const [key, val] of Object.entries(data)) {
      if (!key.startsWith('$')) {
        sites[key] = val;
      }
    }
    siteDataCache = sites;
    return siteDataCache;
  } catch (err) {
    console.error('Failed to load sherlock_data.json:', err);
    return {};
  }
}

// Popular / top platforms list for quick scan option
export const POPULAR_SITES = [
  'GitHub', 'GitLab', 'Twitter', 'Instagram', 'Reddit', 'TikTok',
  'Pinterest', 'YouTube', 'Twitch', 'Telegram', 'Steam', 'Spotify',
  'SoundCloud', 'Medium', 'Patreon', 'DeviantArt', 'Snapchat',
  'Vimeo', 'Disqus', 'Docker Hub', 'npm', 'ProductHunt',
  'HackerNews', 'Pastebin', 'Bitbucket', 'Codecademy', 'Duolingo',
  'Flickr', 'Goodreads', 'Gravatar', 'Keybase', 'Kickstarter',
  'LeetCode', 'Linktree', 'Mastodon', 'Notion', 'Substack',
  'Wattpad', 'Wikipedia', 'WordPress', 'Chess.com', 'BuyMeACoffee'
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Check a single site for a username
 */
export async function checkSingleSite(siteName, siteInfo, username) {
  const startTime = Date.now();
  const profileUrl = siteInfo.url.replace('{}', username);
  const probeUrl = (siteInfo.urlProbe || siteInfo.url).replace('{}', encodeURIComponent(username));

  // 1. Regex pre-check
  if (siteInfo.regexCheck) {
    try {
      const regex = new RegExp(siteInfo.regexCheck);
      if (!regex.test(username)) {
        return {
          siteName,
          url: profileUrl,
          status: 'not_found',
          httpStatus: null,
          responseTime: Date.now() - startTime,
          errorMsg: 'Username does not match site regex format',
        };
      }
    } catch {
      // Ignore invalid regex in data
    }
  }

  // 2. Prepare HTTP request
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(siteInfo.headers || {}),
  };

  const method = siteInfo.request_method || 'GET';
  const fetchOptions = {
    method,
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(8000), // 8 seconds per request
  };

  if (method.toUpperCase() === 'POST' && siteInfo.request_payload) {
    try {
      fetchOptions.body = JSON.stringify(siteInfo.request_payload).replace('{}', username);
    } catch {
      // payload fallback
    }
  }

  try {
    const response = await fetch(probeUrl, fetchOptions);
    const responseTime = Date.now() - startTime;
    const httpStatus = response.status;

    // Rate limited or blocked
    if (httpStatus === 429 || httpStatus === 403) {
      return {
        siteName,
        url: profileUrl,
        status: 'error',
        httpStatus,
        responseTime,
        errorMsg: `Rate limited or protected (HTTP ${httpStatus})`,
      };
    }

    const { errorType, errorMsg, errorUrl, errorCode } = siteInfo;

    // A. status_code detection
    if (errorType === 'status_code') {
      if (errorCode && httpStatus === errorCode) {
        return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
      }
      if (httpStatus === 404) {
        return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
      }
      if (httpStatus >= 200 && httpStatus < 300) {
        return { siteName, url: profileUrl, status: 'found', httpStatus, responseTime };
      }
      return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
    }

    // B. message detection
    if (errorType === 'message') {
      if (httpStatus === 404) {
        return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
      }
      const text = await response.text();
      const messages = Array.isArray(errorMsg) ? errorMsg : [errorMsg];
      
      const hasErrorMsg = messages.some(msg => msg && text.includes(msg));
      if (hasErrorMsg) {
        return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
      }

      if (httpStatus >= 200 && httpStatus < 300) {
        return { siteName, url: profileUrl, status: 'found', httpStatus, responseTime };
      }
      return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
    }

    // C. response_url detection
    if (errorType === 'response_url') {
      const finalUrl = response.url || '';
      if (errorUrl && finalUrl.includes(errorUrl)) {
        return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
      }
      if (httpStatus >= 200 && httpStatus < 300) {
        return { siteName, url: profileUrl, status: 'found', httpStatus, responseTime };
      }
      return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };
    }

    // Default fallback check
    if (httpStatus >= 200 && httpStatus < 300) {
      return { siteName, url: profileUrl, status: 'found', httpStatus, responseTime };
    }
    return { siteName, url: profileUrl, status: 'not_found', httpStatus, responseTime };

  } catch (err) {
    return {
      siteName,
      url: profileUrl,
      status: 'error',
      httpStatus: null,
      responseTime: Date.now() - startTime,
      errorMsg: err.name === 'TimeoutError' ? 'Request timed out (8s)' : (err.message || 'Connection failed'),
    };
  }
}

/**
 * Run parallel checks on a pool of sites with concurrency limit
 */
export async function huntUsername(username, options = {}) {
  const {
    mode = 'popular', // 'popular' | 'all'
    concurrency = 15,
    onResult = () => {},
  } = options;

  const allSites = getSiteData();
  let siteEntries = [];

  if (mode === 'popular') {
    // Prioritize known popular sites, then fill with others up to 50
    const popularSet = new Set(POPULAR_SITES.map(s => s.toLowerCase()));
    const matchedPopular = [];
    const others = [];

    for (const [name, info] of Object.entries(allSites)) {
      if (popularSet.has(name.toLowerCase())) {
        matchedPopular.push([name, info]);
      } else {
        others.push([name, info]);
      }
    }
    siteEntries = [...matchedPopular, ...others.slice(0, 50 - matchedPopular.length)];
  } else {
    siteEntries = Object.entries(allSites);
  }

  const results = [];
  let index = 0;

  async function worker() {
    while (index < siteEntries.length) {
      const currentIndex = index++;
      const [siteName, siteInfo] = siteEntries[currentIndex];
      try {
        const res = await checkSingleSite(siteName, siteInfo, username);
        results.push(res);
        onResult(res, results.length, siteEntries.length);
      } catch (err) {
        const fallback = {
          siteName,
          url: siteInfo.url.replace('{}', username),
          status: 'error',
          httpStatus: null,
          responseTime: 0,
          errorMsg: err.message,
        };
        results.push(fallback);
        onResult(fallback, results.length, siteEntries.length);
      }
    }
  }

  // Spawn concurrency workers
  const workers = Array.from({ length: Math.min(concurrency, siteEntries.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

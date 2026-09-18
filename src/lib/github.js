/**
 * GitHub API Helper for GitDiagram
 * Handles repository parsing, tree fetching, README extraction, and key architectural file reading.
 */

export function parseGitHubUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Please provide a valid GitHub repository URL.');
  }

  let cleaned = input.trim();
  // Remove trailing .git or slashes
  cleaned = cleaned.replace(/\.git\/?$/, '').replace(/\/+$/, '');

  // Handle owner/repo format directly
  const simpleMatch = cleaned.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simpleMatch) {
    return {
      owner: simpleMatch[1],
      repo: simpleMatch[2],
      branch: null,
      subpath: '',
    };
  }

  // Handle full URL: https://github.com/owner/repo(/tree/branch/subpath)?
  const urlPattern = /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?$/i;
  const match = cleaned.match(urlPattern);

  if (!match) {
    throw new Error('Invalid GitHub URL format. Example: https://github.com/owner/repository');
  }

  return {
    owner: match[1],
    repo: match[2],
    branch: match[3] ? decodeURIComponent(match[3]) : null,
    subpath: match[4] ? decodeURIComponent(match[4]) : '',
  };
}

function getHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ScraperHouse-GitDiagram/1.0',
  };
  const authToken = token || process.env.GITHUB_TOKEN;
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Fetch basic repository metadata (default branch, description, stars, language)
 */
export async function fetchRepoMetadata(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, { headers: getHeaders(token) });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" was not found or is private.`);
    }
    if (res.status === 403 || res.status === 429) {
      const resetTime = res.headers.get('x-ratelimit-reset');
      const resetMsg = resetTime ? ` (resets at ${new Date(Number(resetTime) * 1000).toLocaleTimeString()})` : '';
      throw new Error(`GitHub API rate limit reached${resetMsg}. Please provide a GitHub Token in settings to continue.`);
    }
    throw new Error(`Failed to fetch repository metadata (${res.status}: ${res.statusText})`);
  }

  const data = await res.json();
  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description || 'No description provided',
    defaultBranch: data.default_branch || 'main',
    stars: data.stargazers_count,
    forks: data.forks_count,
    language: data.language || 'Unknown',
    topics: data.topics || [],
    isPrivate: data.private,
  };
}

/**
 * Fetch git tree recursively
 */
export async function fetchRepoTree(owner, repo, branch, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, { headers: getHeaders(token) });

  if (!res.ok) {
    throw new Error(`Failed to fetch file tree for branch "${branch}" (${res.status}: ${res.statusText})`);
  }

  const data = await res.json();
  const tree = data.tree || [];

  // Filter out noise / non-architectural paths
  const ignoredPatterns = [
    /^\.git(\/|$)/i,
    /node_modules(\/|$)/i,
    /\.next(\/|$)/i,
    /dist(\/|$)/i,
    /build(\/|$)/i,
    /out(\/|$)/i,
    /target(\/|$)/i,
    /vendor(\/|$)/i,
    /__pycache__(\/|$)/i,
    /\.venv(\/|$)/i,
    /venv(\/|$)/i,
    /\.idea(\/|$)/i,
    /\.vscode(\/|$)/i,
    /\.(png|jpg|jpeg|gif|svg|ico|webp|pdf|zip|tar|gz|exe|dll|dylib|so|woff|woff2|ttf|eot)$/i,
    /package-lock\.json$/i,
    /yarn\.lock$/i,
    /pnpm-lock\.yaml$/i,
    /poetry\.lock$/i,
    /Cargo\.lock$/i,
  ];

  const filtered = tree
    .filter((item) => !ignoredPatterns.some((regex) => regex.test(item.path)))
    .map((item) => ({
      path: item.path,
      type: item.type === 'tree' ? 'dir' : 'file',
      size: item.size || 0,
    }));

  return {
    items: filtered,
    isTruncated: Boolean(data.truncated),
  };
}

/**
 * Fetch README content if available
 */
export async function fetchRepoReadme(owner, repo, branch, token) {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
    const res = await fetch(rawUrl, { headers: getHeaders(token) });
    if (res.ok) {
      const text = await res.text();
      // Cap readme at 8,000 characters to keep prompt tokens reasonable
      return text.slice(0, 8000);
    }

    // Try lowercase readme.md
    const rawUrlLower = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/readme.md`;
    const resLower = await fetch(rawUrlLower, { headers: getHeaders(token) });
    if (resLower.ok) {
      const text = await resLower.text();
      return text.slice(0, 8000);
    }
  } catch {
    // Ignore readme fetch error
  }
  return null;
}

/**
 * Fetch key architectural files content ("lebih akurat")
 * Picks configs, manifests, main entry points, and route definitions.
 */
export async function fetchKeyFilesContent(owner, repo, branch, treeItems, token) {
  const priorityPatterns = [
    // Manifests / Package configs
    { regex: /^package\.json$/i, weight: 100 },
    { regex: /^go\.mod$/i, weight: 100 },
    { regex: /^Cargo\.toml$/i, weight: 100 },
    { regex: /^requirements\.txt$/i, weight: 90 },
    { regex: /^pyproject\.toml$/i, weight: 90 },
    { regex: /^docker-compose\.ya?ml$/i, weight: 85 },
    { regex: /^Dockerfile$/i, weight: 80 },
    { regex: /^pom\.xml$/i, weight: 80 },
    // Entry points
    { regex: /^(?:src\/)?(?:index|main|app|server)\.(?:js|ts|mjs|cjs|go|rs|py)$/i, weight: 70 },
    { regex: /^(?:src\/)?app\/layout\.(?:js|jsx|ts|tsx)$/i, weight: 65 },
    { regex: /^(?:src\/)?app\/page\.(?:js|jsx|ts|tsx)$/i, weight: 60 },
    { regex: /^(?:src\/)?routes?\.(?:js|ts|py)$/i, weight: 60 },
    { regex: /^(?:src\/)?api\/(?:index|routes?)\.(?:js|ts)$/i, weight: 55 },
    { regex: /^architecture\.md$/i, weight: 75 },
  ];

  const candidateFiles = [];

  for (const item of treeItems) {
    if (item.type !== 'file') continue;
    for (const p of priorityPatterns) {
      if (p.regex.test(item.path)) {
        candidateFiles.push({ path: item.path, weight: p.weight, size: item.size });
        break;
      }
    }
  }

  // Sort by priority weight
  candidateFiles.sort((a, b) => b.weight - a.weight);

  // Take top 6 files maximum
  const selectedFiles = candidateFiles.slice(0, 6);
  const fileContents = [];

  for (const file of selectedFiles) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
      const res = await fetch(rawUrl, { credentials: 'omit', headers: getHeaders(token) });
      if (res.ok) {
        const text = await res.text();
        // Limit each file to 2,500 characters to keep prompt compact & fast
        const snippet = text.length > 2500 ? text.slice(0, 2500) + '\n... [truncated]' : text;
        fileContents.push({
          path: file.path,
          content: snippet,
        });
      }
    } catch {
      // Continue if one file fails to fetch
    }
  }

  return fileContents;
}

/**
 * Format file tree into a concise textual hierarchy
 */
export function formatTreeStructure(treeItems, maxItems = 150) {
  const itemsToInclude = treeItems.slice(0, maxItems);
  const paths = itemsToInclude.map((i) => (i.type === 'dir' ? `${i.path}/` : i.path));
  let result = paths.join('\n');
  if (treeItems.length > maxItems) {
    result += `\n... and ${treeItems.length - maxItems} more files`;
  }
  return result;
}

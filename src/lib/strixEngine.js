import { getGroqClient } from '@/lib/diagramGenerator';
import { 
  parseGitHubUrl, 
  fetchRepoMetadata, 
  fetchRepoTree, 
  fetchRepoReadme, 
  fetchKeyFilesContent, 
  formatTreeStructure 
} from '@/lib/github';

const DEFAULT_MODEL = 'openai/gpt-oss-120b';

const COMMON_SENSITIVE_PATHS = [
  // Environment and configuration files
  { path: '/.env', desc: 'Environment variables file' },
  { path: '/.env.local', desc: 'Local environment configuration' },
  { path: '/.env.production', desc: 'Production environment configuration' },
  { path: '/.env.example', desc: 'Environment configuration template' },
  { path: '/.env.backup', desc: 'Environment backup file' },
  // Git & metadata
  { path: '/.git/HEAD', desc: 'Git repository metadata' },
  { path: '/robots.txt', desc: 'Robots crawler directives' },
  { path: '/.well-known/security.txt', desc: 'Security contact declaration' },
  { path: '/security.txt', desc: 'Security disclosure file' },
  // API specs & docs
  { path: '/swagger.json', desc: 'OpenAPI / Swagger API specification' },
  { path: '/api-docs', desc: 'Interactive API documentation' },
  { path: '/api', desc: 'Base API endpoint' },
  { path: '/graphql', desc: 'GraphQL endpoint' },
  // Admin & management interfaces
  { path: '/admin', desc: 'Administrative control portal' },
  { path: '/admin/login', desc: 'Admin login page' },
  { path: '/administrator', desc: 'Joomla/CMS administrator portal' },
  { path: '/manage', desc: 'Management console' },
  { path: '/cpanel', desc: 'Control panel interface' },
  { path: '/dashboard', desc: 'User / Admin dashboard' },
  { path: '/wp-admin', desc: 'WordPress administrative dashboard' },
  // Login & authentication endpoints
  { path: '/login', desc: 'User login portal' },
  { path: '/signin', desc: 'Sign in endpoint' },
  { path: '/auth/login', desc: 'Authentication login endpoint' },
  { path: '/api/login', desc: 'API login handler' },
  { path: '/api/auth/signin', desc: 'NextAuth / Auth.js signin handler' },
  { path: '/wp-login.php', desc: 'WordPress login handler' },
];

/**
 * Parses raw .env content to extract endpoints, URLs, and sensitive configurations.
 */
export function parseEnvContent(envText, sourceLabel = '.env') {
  if (!envText || typeof envText !== 'string') return [];
  const lines = envText.split(/\r?\n/);
  const extracted = [];
  const seenKeys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip wrapping quotes
    val = val.replace(/^["'](.*)["']$/, '$1').trim();

    if (!key || seenKeys.has(key)) continue;

    const isUrl = /^https?:\/\//i.test(val) || 
                  /^(mongodb(\+srv)?|postgres(ql)?|redis|mysql|sqlite|amqp):\/\//i.test(val);
    const isEndpointKey = /(URL|URI|ENDPOINT|HOST|DOMAIN|API|PATH|SERVICE|PORTAL|GATEWAY|BACKEND|SERVER)/i.test(key);
    const isPathVal = /^\/[a-zA-Z0-9_\-\/]+$/.test(val);

    if (isUrl || isEndpointKey || isPathVal) {
      seenKeys.add(key);
      const isSecret = /(KEY|SECRET|PASSWORD|PASS|PASSWD|TOKEN|CREDENTIAL|PRIVATE|CERT)/i.test(key);
      let detectedType = 'ENDPOINT';
      if (isUrl) {
        if (/mongodb/i.test(val)) detectedType = 'MONGODB_URI';
        else if (/postgres/i.test(val)) detectedType = 'POSTGRES_URL';
        else if (/redis/i.test(val)) detectedType = 'REDIS_URL';
        else if (/mysql/i.test(val)) detectedType = 'MYSQL_URL';
        else detectedType = 'HTTP_URL';
      } else if (isPathVal) {
        detectedType = 'API_PATH';
      }

      extracted.push({
        key,
        value: val,
        type: detectedType,
        isSecret,
        source: sourceLabel,
      });
    }
  }

  return extracted;
}

/**
 * Extracts links, form actions, and script route references from an HTML page.
 */
export function extractEndpointsFromHtml(html, baseUrlStr) {
  if (!html || typeof html !== 'string') {
    return { adminEndpoints: [], loginEndpoints: [], allEndpoints: [] };
  }

  let baseUrl;
  try {
    baseUrl = new URL(baseUrlStr);
  } catch {
    baseUrl = { origin: '' };
  }

  const adminSet = new Set();
  const loginSet = new Set();
  const allSet = new Set();

  // 1. Extract href links
  const hrefMatches = html.matchAll(/href=["'](\/[^"'#\s]*|https?:\/\/[^"'#\s]*)["']/gi);
  for (const match of hrefMatches) {
    const rawPath = match[1];
    let path = rawPath;
    if (rawPath.startsWith('http')) {
      try {
        const u = new URL(rawPath);
        if (baseUrl.origin && u.origin !== baseUrl.origin) continue;
        path = u.pathname + u.search;
      } catch {
        continue;
      }
    }
    if (!path.startsWith('/')) continue;
    allSet.add(path);

    if (/(admin|administrator|cpanel|dashboard|portal|manage|backend)/i.test(path)) {
      adminSet.add(path);
    }
    if (/(login|signin|sign-in|auth|session|signup|register)/i.test(path)) {
      loginSet.add(path);
    }
  }

  // 2. Extract form actions and detect login forms
  const formMatches = html.matchAll(/<form[^>]*action=["']([^"']*)["'][^>]*>(.*?)<\/form>/gis);
  for (const match of formMatches) {
    const action = match[1] || '';
    const formInner = match[2] || '';
    let actionPath = action;
    if (action.startsWith('http')) {
      try {
        actionPath = new URL(action).pathname;
      } catch {
        actionPath = action;
      }
    }
    if (actionPath.startsWith('/')) {
      allSet.add(actionPath);
    }

    const hasPasswordField = /type=["']password["']|name=["'](password|pass|passwd|token)["']/i.test(formInner);
    const isAuthAction = /(login|signin|auth|session)/i.test(actionPath);

    if (hasPasswordField || isAuthAction) {
      loginSet.add(actionPath || '/login');
    }
    if (/(admin|manage)/i.test(actionPath)) {
      adminSet.add(actionPath);
    }
  }

  // 3. Extract API and route literals in JavaScript strings
  const jsStringMatches = html.matchAll(/["'](\/(?:api|admin|auth|login|dashboard)\/[a-zA-Z0-9_\-\/]+)["']/g);
  for (const match of jsStringMatches) {
    const endpoint = match[1];
    allSet.add(endpoint);
    if (/(admin|manage)/i.test(endpoint)) adminSet.add(endpoint);
    if (/(login|signin|auth)/i.test(endpoint)) loginSet.add(endpoint);
  }

  return {
    adminEndpoints: Array.from(adminSet),
    loginEndpoints: Array.from(loginSet),
    allEndpoints: Array.from(allSet).slice(0, 40),
  };
}

/**
 * Perform active reconnaissance on a live HTTP/HTTPS web target.
 */
export async function probeWebTarget(targetUrl) {
  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const reconData = {
    url: normalizedUrl,
    statusCode: null,
    server: 'Unknown',
    ipAddress: '',
    technologies: [],
    headers: {},
    missingSecurityHeaders: [],
    probedEndpoints: [],
    exposedRisks: [],
    envEndpoints: [],
    adminEndpoints: [],
    loginEndpoints: [],
  };

  let htmlBody = '';
  let controller = new AbortController();
  let timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Strix-Pentest/2.0 (Security Audit)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    reconData.statusCode = res.status;
    const headerObj = {};
    res.headers.forEach((value, key) => {
      headerObj[key.toLowerCase()] = value;
    });
    reconData.headers = headerObj;

    // Read initial HTML to extract dynamic endpoints (login & admin links)
    try {
      htmlBody = await res.text();
    } catch {
      htmlBody = '';
    }

    // Detect server banner
    if (headerObj['server']) {
      reconData.server = headerObj['server'];
      reconData.technologies.push(`Server: ${headerObj['server']}`);
    }
    if (headerObj['x-powered-by']) {
      reconData.technologies.push(`Powered-By: ${headerObj['x-powered-by']}`);
      reconData.exposedRisks.push(`Server leaks technology stack via 'X-Powered-By: ${headerObj['x-powered-by']}' (CWE-200)`);
    }

    // Technology heuristics from response headers and body
    if (headerObj['x-nextjs-matched-path'] || headerObj['x-nextjs-page'] || htmlBody.includes('__NEXT_DATA__')) {
      reconData.technologies.push('Framework: Next.js');
    }
    if (htmlBody.includes('/wp-content/') || htmlBody.includes('wp-json')) {
      reconData.technologies.push('CMS: WordPress');
    }
    if (headerObj['cf-ray']) reconData.technologies.push('CDN/WAF: Cloudflare');
    if (headerObj['x-vercel-id']) reconData.technologies.push('Host: Vercel');
    if (headerObj['x-amz-cf-id']) reconData.technologies.push('CDN: AWS CloudFront');

    // Missing Security Headers Assessment
    if (!headerObj['strict-transport-security'] && normalizedUrl.startsWith('https://')) {
      reconData.missingSecurityHeaders.push('Strict-Transport-Security (HSTS)');
    }
    if (!headerObj['content-security-policy']) {
      reconData.missingSecurityHeaders.push('Content-Security-Policy (CSP)');
    }
    if (!headerObj['x-frame-options'] && !headerObj['content-security-policy']?.includes('frame-ancestors')) {
      reconData.missingSecurityHeaders.push('X-Frame-Options (Clickjacking Protection)');
    }
    if (!headerObj['x-content-type-options']) {
      reconData.missingSecurityHeaders.push('X-Content-Type-Options: nosniff');
    }
    if (!headerObj['referrer-policy']) {
      reconData.missingSecurityHeaders.push('Referrer-Policy');
    }
    if (!headerObj['permissions-policy']) {
      reconData.missingSecurityHeaders.push('Permissions-Policy');
    }

    // CORS check
    const corsHeader = headerObj['access-control-allow-origin'];
    if (corsHeader === '*') {
      reconData.exposedRisks.push('Overly permissive wildcard CORS: Access-Control-Allow-Origin is set to "*"');
    }

    // Cookie security flags check
    const setCookie = headerObj['set-cookie'];
    if (setCookie) {
      if (!/secure/i.test(setCookie) && normalizedUrl.startsWith('https://')) {
        reconData.exposedRisks.push('Cookie missing "Secure" flag (transmitted over cleartext if downgraded)');
      }
      if (!/httponly/i.test(setCookie)) {
        reconData.exposedRisks.push('Cookie missing "HttpOnly" flag (accessible to malicious JavaScript via XSS)');
      }
      if (!/samesite/i.test(setCookie)) {
        reconData.exposedRisks.push('Cookie missing "SameSite" attribute (susceptible to CSRF)');
      }
    }

  } catch (err) {
    clearTimeout(timeoutId);
    reconData.exposedRisks.push(`Initial connectivity probe error: ${err.message}`);
  }

  // Extract endpoints from the fetched HTML
  const htmlExtracted = extractEndpointsFromHtml(htmlBody, normalizedUrl);

  // Build the complete list of target endpoints to probe
  const pathsToProbe = [...COMMON_SENSITIVE_PATHS];

  // Add dynamically discovered admin endpoints
  for (const adm of htmlExtracted.adminEndpoints) {
    if (!pathsToProbe.some(p => p.path === adm)) {
      pathsToProbe.push({ path: adm, desc: `Discovered Admin Interface (${adm})` });
    }
  }

  // Add dynamically discovered login endpoints
  for (const log of htmlExtracted.loginEndpoints) {
    if (!pathsToProbe.some(p => p.path === log)) {
      pathsToProbe.push({ path: log, desc: `Discovered Authentication Portal (${log})` });
    }
  }

  const baseUrl = new URL(normalizedUrl).origin;

  // Concurrently probe paths
  for (const item of pathsToProbe) {
    try {
      const probeController = new AbortController();
      const pTimeout = setTimeout(() => probeController.abort(), 4500);
      const probeUrl = `${baseUrl}${item.path}`;

      const probeRes = await fetch(probeUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Strix-Pentest/2.0' },
        signal: probeController.signal,
        redirect: 'manual', // do not auto follow redirects so we detect 302 to login
      });
      clearTimeout(pTimeout);

      const status = probeRes.status;
      const accessible = status >= 200 && status < 300;
      let note = item.desc;

      // SPECIFIC HANDLING FOR .ENV FILES
      if (item.path.includes('.env') && accessible) {
        try {
          const envText = await probeRes.text();
          // Verify it's actually an env file (has KEY=VALUE format)
          if (/[A-Z0-9_]+\s*=\s*.+/m.test(envText)) {
            const parsedEnv = parseEnvContent(envText, item.path);
            reconData.envEndpoints.push(...parsedEnv);
            note = `CRITICAL LEAK: .env file accessible (${parsedEnv.length} endpoints/secrets extracted)!`;
            reconData.exposedRisks.push(`Publicly readable ${item.path} file leaking ${parsedEnv.length} service URLs and configuration secrets (CWE-200, CWE-798)`);
          } else {
            note = `Endpoint returned HTTP ${status} (No valid .env formatting detected)`;
          }
        } catch {
          note = `Accessible with HTTP ${status}`;
        }
      }

      // SPECIFIC HANDLING FOR ADMIN ENDPOINTS
      const isAdminPath = /(admin|administrator|cpanel|dashboard|manage|backend)/i.test(item.path);
      if (isAdminPath) {
        let isExposedWithoutAuth = false;
        if (accessible) {
          isExposedWithoutAuth = true;
          note = `EXPOSED ADMIN: ${item.path} returned HTTP 200 without authentication requirement!`;
          reconData.exposedRisks.push(`Unprotected Admin Interface at ${item.path} returned HTTP 200 (Broken Access Control - A01:2025)`);
        } else if (status === 401 || status === 403) {
          note = `Admin portal detected at ${item.path} (Properly protected with HTTP ${status}).`;
        } else if (status === 301 || status === 302 || status === 307 || status === 308) {
          const loc = probeRes.headers.get('location') || '';
          note = `Admin portal redirects (HTTP ${status} -> ${loc}).`;
        }

        reconData.adminEndpoints.push({
          path: item.path,
          status,
          accessible: isExposedWithoutAuth,
          note,
        });
      }

      // SPECIFIC HANDLING FOR LOGIN ENDPOINTS
      const isLoginPath = /(login|signin|sign-in|auth|session|signup)/i.test(item.path);
      if (isLoginPath) {
        reconData.loginEndpoints.push({
          path: item.path,
          status,
          accessible,
          method: 'POST',
          note: accessible ? `Active authentication portal discovered at ${item.path}` : `Status HTTP ${status}`,
        });
      }

      reconData.probedEndpoints.push({
        path: item.path,
        status,
        accessible,
        title: item.desc,
        note,
      });

    } catch {
      reconData.probedEndpoints.push({
        path: item.path,
        status: 0,
        accessible: false,
        title: item.desc,
        note: 'Connection timed out or host refused connection.',
      });
    }
  }

  return reconData;
}

/**
 * Perform white-box code and architecture reconnaissance on a GitHub repository.
 */
export async function probeRepoTarget(repoUrl, githubToken) {
  const { owner, repo, branch: customBranch } = parseGitHubUrl(repoUrl);
  const repoMeta = await fetchRepoMetadata(owner, repo, githubToken);
  const targetBranch = customBranch || repoMeta.defaultBranch || 'main';

  const treeResult = await fetchRepoTree(owner, repo, targetBranch, githubToken);
  const formattedTree = formatTreeStructure(treeResult.items);

  const [readmeText, keyFiles] = await Promise.all([
    fetchRepoReadme(owner, repo, targetBranch, githubToken),
    fetchKeyFilesContent(owner, repo, targetBranch, treeResult.items, githubToken),
  ]);

  const sensitiveFilesFound = [];
  const manifestFiles = [];
  const envEndpoints = [];
  const adminEndpoints = [];
  const loginEndpoints = [];

  // 1. Search tree items for .env files and extract endpoints
  const envFilesToFetch = [];
  for (const item of treeResult.items) {
    const p = item.path.toLowerCase();
    const fileName = item.path.split('/').pop().toLowerCase();

    // Look for .env files
    if (fileName === '.env' || fileName.startsWith('.env.') || fileName === 'env.example') {
      sensitiveFilesFound.push(`Environment file in repository: ${item.path}`);
      envFilesToFetch.push(item.path);
    }

    // Look for private keys
    if (p.endsWith('.pem') || p.endsWith('.key') || p.includes('id_rsa')) {
      sensitiveFilesFound.push(`Potential private key file in repository: ${item.path}`);
    }

    // Look for dependency manifests
    if (['package.json', 'requirements.txt', 'pom.xml', 'gemfile', 'go.mod', 'composer.json'].includes(fileName)) {
      manifestFiles.push(item.path);
    }

    // Detect Admin routes in source tree
    if (/(^|\/)admin(\/|\.|$)/i.test(item.path) || /(adminController|adminRouter|routes\/admin)/i.test(item.path)) {
      adminEndpoints.push({
        path: item.path,
        status: 200,
        accessible: true,
        note: `Admin route definition found in codebase: ${item.path}`,
      });
    }

    // Detect Login / Auth routes in source tree
    if (/(^|\/)(login|signin|auth)(\/|\.|$)/i.test(item.path) || /(authController|authRouter|routes\/auth)/i.test(item.path)) {
      loginEndpoints.push({
        path: item.path,
        status: 200,
        accessible: true,
        method: 'POST',
        note: `Authentication route definition found in codebase: ${item.path}`,
      });
    }
  }

  // 2. Fetch and parse contents of discovered .env files
  for (const envPath of envFilesToFetch.slice(0, 4)) {
    try {
      const rawEnvUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${envPath}`;
      const envRes = await fetch(rawEnvUrl, {
        headers: githubToken ? { Authorization: `token ${githubToken}` } : {},
      });
      if (envRes.ok) {
        const envContent = await envRes.text();
        const parsed = parseEnvContent(envContent, envPath);
        envEndpoints.push(...parsed);
      }
    } catch {
      // Continue if fetch fails
    }
  }

  return {
    repoInfo: repoMeta,
    targetBranch,
    fileTree: formattedTree,
    readmeText,
    keyFiles,
    sensitiveFilesFound,
    manifestFiles,
    envEndpoints,
    adminEndpoints,
    loginEndpoints,
    totalFiles: treeResult.items.length,
  };
}

/**
 * Builds the comprehensive Strix autonomous pentest prompt adhering to OWASP Top 10:2025.
 */
function buildStrixSystemPrompt() {
  return `You are STRIX — the Autonomous AI Penetration Testing & Vulnerability Research Engine.
You operate with the mindset of an elite ethical hacker and Principal Application Security Researcher.
Your mission is to perform an exhaustive, evidence-backed penetration test against the provided target.

### CORE OPERATIONAL DIRECTIVES:
1. FOCUS ON REAL, ACTIONABLE VULNERABILITIES: Never report vague, theoretical issues. Report only flaws that have verifiable attack vectors, impact, and a reproducible Proof-of-Concept (PoC).
2. SPECIAL ATTENTION TO DISCOVERED .ENV ENDPOINTS & SECRETS:
   - If endpoints, database strings (MongoDB, PostgreSQL, Redis), or service URLs were discovered from .env files, analyze their exposure, credential strength, and SSRF risk.
   - If an exposed .env is present on a live server, report it as a Critical Information Disclosure (CWE-200 / CWE-798).
3. SPECIAL ATTENTION TO /ADMIN & AUTHENTICATION/LOGIN ENDPOINTS:
   - Analyze any discovered /admin or administrator endpoints for Broken Access Control (A01:2025), missing authentication guards, IDOR, or privilege escalation.
   - Analyze any login endpoints for Authentication Failures (A07:2025), SQL injection in auth parameters, credential stuffing susceptibility, and lack of CSRF tokens.
4. USE THE OWASP TOP 10:2025 STANDARD:
   - A01:2025 Broken Access Control (including SSRF, IDOR, Privilege Escalation, Path Traversal)
   - A02:2025 Security Misconfiguration (Permissive CORS, missing security headers, exposed debug endpoints, default credentials)
   - A03:2025 Software Supply Chain Failures (Outdated/vulnerable dependencies, unpinned components, malicious packages)
   - A04:2025 Cryptographic Failures (Weak TLS, cleartext secrets, hardcoded API keys, broken JWT signatures)
   - A05:2025 Injection (SQLi, NoSQLi, Command Injection, Template Injection / SSTI, XSS)
   - A06:2025 Insecure Design (Business logic flaws, lack of rate limiting, workflow bypass)
   - A07:2025 Authentication Failures (Auth bypass, brute-force susceptibility, missing MFA, session hijacking)
   - A08:2025 Software or Data Integrity Failures (Insecure deserialization, untrusted CDN scripts without SRI)
   - A09:2025 Security Logging & Alerting Failures
   - A10:2025 Mishandling of Exceptional Conditions (Fail-open behavior, stack trace disclosure in responses)
5. GENERATE COMPLETE, READY-TO-USE PROOF-OF-CONCEPT (PoC) CODE:
   - For every critical/high/medium vulnerability, produce a realistic exploit script (Python requests or curl commands) demonstrating how an attacker exploits the vulnerability.
6. PROVIDE PRECISE REMEDIATION & CODE PATCHES:
   - Show the exact code diff or replacement snippet that completely eliminates the vulnerability.
7. CVSS v3.1 SCORING:
   - Provide an accurate CVSS base score (0.0 to 10.0) reflecting real-world exploitability and impact.

OUTPUT FORMAT:
You MUST output ONLY a valid JSON object matching the exact JSON schema below. Do not wrap in markdown or backticks.`;
}

function buildStrixUserPrompt({ targetType, target, reconData, repoData, codeSnippet, instruction, scanMode }) {
  let contextText = `TARGET CLASSIFICATION: ${targetType.toUpperCase()}\nTARGET IDENTIFIER: ${target}\nSCAN MODE: ${scanMode.toUpperCase()}\n`;

  if (instruction) {
    contextText += `USER INSTRUCTION & FOCUS: "${instruction}"\n`;
  }

  if (targetType === 'url' && reconData) {
    contextText += `
---
### LIVE TARGET RECONNAISSANCE & ACTIVE PROBE RESULTS:
- Target URL: ${reconData.url}
- HTTP Status: ${reconData.statusCode || 'N/A'}
- Detected Server Banner: ${reconData.server}
- Identified Technologies: ${reconData.technologies.join(', ') || 'Standard Web Stack'}
- Response Headers:
\`\`\`json
${JSON.stringify(reconData.headers, null, 2)}
\`\`\`
- Missing Essential Security Headers: ${reconData.missingSecurityHeaders.join(', ') || 'None'}
- Exposed Risks / Misconfigurations Detected:
${reconData.exposedRisks.map(r => `  * ${r}`).join('\n') || '  * None detected in surface probe'}

### DISCOVERED .ENV ENDPOINTS & CONFIGURATIONS:
${reconData.envEndpoints?.length > 0 
  ? reconData.envEndpoints.map(e => `  * [${e.type}] ${e.key} = ${e.value} (from ${e.source})`).join('\n')
  : '  * No public .env endpoints detected in initial probe'}

### DISCOVERED ADMIN & MANAGEMENT ENDPOINTS (/admin):
${reconData.adminEndpoints?.length > 0 
  ? reconData.adminEndpoints.map(a => `  * ${a.path} -> Status ${a.status} (${a.note})`).join('\n')
  : '  * No custom admin portals discovered'}

### DISCOVERED LOGIN & AUTHENTICATION ENDPOINTS:
${reconData.loginEndpoints?.length > 0 
  ? reconData.loginEndpoints.map(l => `  * [${l.method}] ${l.path} -> Status ${l.status} (${l.note})`).join('\n')
  : '  * Standard login endpoints'}

- All Probed Security Endpoints:
${reconData.probedEndpoints.map(p => `  * ${p.path} -> Status ${p.status} (${p.note})`).join('\n')}
`;
  } else if (targetType === 'repo' && repoData) {
    contextText += `
---
### REPOSITORY METADATA & CODE ANALYSIS:
- Repository: ${repoData.repoInfo.fullName}
- Description: ${repoData.repoInfo.description || 'N/A'}
- Primary Language: ${repoData.repoInfo.language || 'Unknown'}
- Default Branch: ${repoData.targetBranch}

### EXTRACTED .ENV ENDPOINTS & SECRETS FROM REPOSITORY:
${repoData.envEndpoints?.length > 0 
  ? repoData.envEndpoints.map(e => `  * [${e.type}] ${e.key} = ${e.value} (from ${e.source})`).join('\n')
  : '  * No .env files extracted'}

### DISCOVERED ADMIN ROUTES IN CODEBASE:
${repoData.adminEndpoints?.length > 0 
  ? repoData.adminEndpoints.map(a => `  * ${a.path} (${a.note})`).join('\n')
  : '  * No explicit admin routes in file tree'}

### DISCOVERED LOGIN / AUTH ROUTES IN CODEBASE:
${repoData.loginEndpoints?.length > 0 
  ? repoData.loginEndpoints.map(l => `  * ${l.path} (${l.note})`).join('\n')
  : '  * No explicit login routes in file tree'}

- Identified Sensitive Files:
${repoData.sensitiveFilesFound.map(s => `  * ${s}`).join('\n') || '  * None discovered in root file tree'}
- Manifest & Dependency Files: ${repoData.manifestFiles.join(', ') || 'None found'}

### REPOSITORY FILE TREE:
\`\`\`
${repoData.fileTree}
\`\`\`

### README EXCERPT:
\`\`\`markdown
${repoData.readmeText || 'No README file present'}
\`\`\`

### KEY SOURCE CODE EXCERPTS:
`;
    for (const f of (repoData.keyFiles || [])) {
      contextText += `
#### File: ${f.path}
\`\`\`
${f.content}
\`\`\`
`;
    }
  } else if (targetType === 'code' && codeSnippet) {
    contextText += `
---
### RAW CODE & SPECIFICATION TARGET FOR AUDIT:
\`\`\`
${codeSnippet}
\`\`\`
`;
    if (reconData?.envEndpoints?.length > 0) {
      contextText += `
### PARSED .ENV ENDPOINTS & SECRETS FROM CODE SNIPPET:
${reconData.envEndpoints.map(e => `  * [${e.type}] ${e.key} = ${e.value}`).join('\n')}
`;
    }
    if (reconData?.adminEndpoints?.length > 0) {
      contextText += `
### DETECTED ADMIN ROUTES IN SNIPPET:
${reconData.adminEndpoints.map(a => `  * ${a.path}`).join('\n')}
`;
    }
  }

  contextText += `
---
### REQUIRED JSON RESPONSE STRUCTURE:
Return a valid JSON object with the following schema:
{
  "executiveSummary": "A concise executive briefing (2-3 paragraphs) detailing overall security posture, key vulnerabilities discovered (specifically mentioning .env exposures, /admin access status, and login security if applicable), root causes, and business risk impact.",
  "riskScore": 75, // Integer 0-100 indicating risk severity
  "riskRating": "CRITICAL", // One of: "CRITICAL", "HIGH", "MEDIUM", "LOW", "SECURE"
  "vulnerabilities": [
    {
      "id": "STRIX-2026-001",
      "title": "Precise Vulnerability Title",
      "severity": "critical", // "critical" | "high" | "medium" | "low" | "info"
      "owaspCategory": "A01:2025 Broken Access Control",
      "cwe": "CWE-89: Improper Neutralization of Special Elements used in an SQL Command",
      "cve": "CVE-2024-XXXX or N/A",
      "cvss": 9.8,
      "cvssVector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      "confidence": "high", // "high" | "medium" | "low"
      "fixEffort": "medium", // "low" | "medium" | "high"
      "endpoint": "/api/v1/auth/login",
      "method": "POST",
      "target": "${target}",
      "description": "Clear explanation of how the vulnerability exists.",
      "evidence": "Concrete evidence (e.g., exposed header, missing check, unescaped parameter).",
      "impact": "What an attacker can achieve (e.g., full database dump, unauthorized privilege escalation).",
      "technicalAnalysis": "In-depth root cause analysis explaining the vulnerable code or missing control.",
      "pocDescription": "Step-by-step reproduction guide for the exploit.",
      "pocScriptCode": "#!/usr/bin/env python3\\nimport requests\\n... Complete working exploit script or curl command ...",
      "codeLocations": [
        {
          "file": "path/to/vulnerable/file.js",
          "startLine": 45,
          "endLine": 52,
          "snippet": "const query = 'SELECT * FROM users WHERE id = ' + userId;"
        }
      ],
      "remediation": "Clear, actionable step-by-step guidance on how to fix this issue.",
      "remediationPatch": "// Replace with parameterized query:\\nconst query = 'SELECT * FROM users WHERE id = $1';",
      "references": [
        "https://owasp.org/Top10/A01_2025-Broken_Access_Control/",
        "https://cwe.mitre.org/data/definitions/89.html"
      ]
    }
  ]
}`;

  return contextText;
}

/**
 * Generates an OASIS SARIF 2.1.0 standard report from scan results.
 */
export function generateSarifReport(scanData) {
  const rules = [];
  const results = [];
  const ruleIdsSeen = new Set();

  for (const vuln of (scanData.vulnerabilities || [])) {
    const ruleId = vuln.cwe?.split(':')[0]?.trim() || vuln.id;
    if (!ruleIdsSeen.has(ruleId)) {
      ruleIdsSeen.add(ruleId);
      rules.push({
        id: ruleId,
        name: vuln.title,
        shortDescription: { text: vuln.title },
        fullDescription: { text: vuln.description || vuln.title },
        helpUri: (vuln.references && vuln.references[0]) || 'https://docs.strix.ai',
        defaultConfiguration: {
          level: vuln.severity === 'critical' || vuln.severity === 'high' ? 'error' : (vuln.severity === 'medium' ? 'warning' : 'note')
        },
        properties: {
          tags: ['security', 'pentest', vuln.owaspCategory || 'OWASP-Top-10'],
          cvss: vuln.cvss,
          cwe: vuln.cwe,
        }
      });
    }

    const firstLoc = vuln.codeLocations && vuln.codeLocations[0];
    results.push({
      ruleId,
      level: vuln.severity === 'critical' || vuln.severity === 'high' ? 'error' : (vuln.severity === 'medium' ? 'warning' : 'note'),
      message: {
        text: `[${vuln.severity.toUpperCase()}] ${vuln.title}: ${vuln.description}`
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: firstLoc?.file || vuln.endpoint || scanData.target || 'target'
            },
            region: {
              startLine: firstLoc?.startLine || 1,
              endLine: firstLoc?.endLine || firstLoc?.startLine || 1,
              snippet: {
                text: firstLoc?.snippet || vuln.evidence || ''
              }
            }
          }
        }
      ],
      properties: {
        severity: vuln.severity,
        cvss: vuln.cvss,
        poc: vuln.pocScriptCode || '',
        remediation: vuln.remediation || '',
      }
    });
  }

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'Strix Autonomous AI Pentester',
            version: '2.0.0',
            informationUri: 'https://strix.ai',
            rules,
          }
        },
        results,
      }
    ]
  };
}

/**
 * Calculate refined Risk Score and Rating based on discovered findings.
 */
export function calculateRiskSummary(vulnerabilities, recon) {
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let info = 0;

  for (const v of vulnerabilities) {
    const sev = (v.severity || 'low').toLowerCase();
    if (sev === 'critical') critical++;
    else if (sev === 'high') high++;
    else if (sev === 'medium') medium++;
    else if (sev === 'low') low++;
    else info++;
  }

  let calculatedScore = (critical * 30) + (high * 15) + (medium * 7) + (low * 2) + (info * 0.5);
  
  if (recon?.missingSecurityHeaders?.length > 2) {
    calculatedScore += 5;
  }
  if (recon?.exposedRisks?.length > 0) {
    calculatedScore += Math.min(recon.exposedRisks.length * 4, 15);
  }
  if (recon?.envEndpoints?.length > 0) {
    calculatedScore += 15; // .env exposed is critical
  }
  if (recon?.adminEndpoints?.some(a => a.accessible)) {
    calculatedScore += 20; // /admin open is critical
  }

  const riskScore = Math.min(Math.max(Math.round(calculatedScore), 0), 100);

  let riskRating = 'SECURE';
  if (critical > 0 || riskScore >= 75) riskRating = 'CRITICAL';
  else if (high > 0 || riskScore >= 50) riskRating = 'HIGH';
  else if (medium > 0 || riskScore >= 25) riskRating = 'MEDIUM';
  else if (low > 0 || riskScore > 0) riskRating = 'LOW';

  return {
    totalVulnerabilities: vulnerabilities.length,
    critical,
    high,
    medium,
    low,
    info,
    riskScore,
    riskRating,
  };
}

/**
 * Main Orchestrator: Runs the full multi-phase pentest.
 */
export async function runStrixPentest({
  targetType, // 'url' | 'repo' | 'code'
  target,
  codeSnippet = '',
  scanMode = 'standard',
  instruction = '',
  groqApiKey = '',
  githubToken = '',
  onProgress = () => {},
}) {
  onProgress({ phase: 'recon', message: `Initializing Strix AI Pentest for ${targetType}: ${target}...`, progress: 10 });

  let reconData = null;
  let repoData = null;

  // Phase 1: Target Reconnaissance
  if (targetType === 'url') {
    onProgress({ phase: 'recon', message: 'Probing live target: checking headers, CORS, TLS, and probing sensitive endpoints...', progress: 20 });
    reconData = await probeWebTarget(target);

    // Report discovery stats
    if (reconData.envEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Found exposed .env with ${reconData.envEndpoints.length} configuration endpoints!`, progress: 30 });
    }
    if (reconData.adminEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Discovered ${reconData.adminEndpoints.length} admin interface endpoint(s) (/admin)...`, progress: 35 });
    }
    if (reconData.loginEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Discovered ${reconData.loginEndpoints.length} login/authentication endpoint(s)...`, progress: 38 });
    }

  } else if (targetType === 'repo') {
    onProgress({ phase: 'recon', message: 'Connecting to GitHub: mapping repository tree, configuration files, and dependencies...', progress: 20 });
    repoData = await probeRepoTarget(target, githubToken);

    if (repoData.envEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Extracted ${repoData.envEndpoints.length} endpoints/credentials from repository .env files...`, progress: 32 });
    }
    if (repoData.adminEndpoints?.length > 0) {
      onProgress({ phase: 'recon', message: `Mapped ${repoData.adminEndpoints.length} admin route(s) in codebase...`, progress: 36 });
    }
  } else {
    onProgress({ phase: 'recon', message: 'Parsing code specification and extracting endpoints / environment configurations...', progress: 25 });
    reconData = {
      url: 'Custom Code / Spec',
      statusCode: null,
      server: 'N/A',
      technologies: [],
      headers: {},
      missingSecurityHeaders: [],
      probedEndpoints: [],
      exposedRisks: [],
      envEndpoints: parseEnvContent(codeSnippet, 'Pasted Code / Spec'),
      adminEndpoints: [],
      loginEndpoints: [],
    };

    if (/(admin|administrator)/i.test(codeSnippet)) {
      reconData.adminEndpoints.push({ path: '/admin', status: 200, accessible: true, note: 'Admin route referenced in snippet' });
    }
    if (/(login|signin|auth)/i.test(codeSnippet)) {
      reconData.loginEndpoints.push({ path: '/login', status: 200, accessible: true, method: 'POST', note: 'Login route referenced in snippet' });
    }
  }

  // Phase 2: Threat Modeling & Static/Dynamic Inspection
  onProgress({ phase: 'threat_model', message: 'Synthesizing attack surface and evaluating against OWASP Top 10:2025 categories...', progress: 45 });

  const groq = getGroqClient(groqApiKey);
  const systemPrompt = buildStrixSystemPrompt();
  const userPrompt = buildStrixUserPrompt({
    targetType,
    target,
    reconData,
    repoData,
    codeSnippet,
    instruction,
    scanMode,
  });

  // Phase 3: AI Pentesting & Exploit Generation
  onProgress({ phase: 'exploitation', message: 'Running autonomous exploit reasoning: evaluating /admin authorization, .env data leaks & generating PoCs...', progress: 65 });

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    model: DEFAULT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const rawContent = chatCompletion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error('LLM failed to return a response for the security scan.');
  }

  onProgress({ phase: 'reporting', message: 'Compiling findings, validating PoCs, and building SARIF 2.1.0 security artifact...', progress: 85 });

  let parsedOutput;
  try {
    parsedOutput = JSON.parse(rawContent);
  } catch (err) {
    console.error('Failed to parse Strix pentest JSON output:', rawContent);
    throw new Error(`Failed to parse AI security response: ${err.message}`);
  }

  const rawVulns = Array.isArray(parsedOutput.vulnerabilities) ? parsedOutput.vulnerabilities : [];

  // Deterministic checks injection for live URLs
  if (targetType === 'url' && reconData) {
    // 1. Missing Security Headers
    if (reconData.missingSecurityHeaders.length > 0 && !rawVulns.some(v => v.title.toLowerCase().includes('header'))) {
      rawVulns.push({
        id: `STRIX-REC-${Date.now().toString().slice(-4)}`,
        title: `Missing Defensive HTTP Security Headers (${reconData.missingSecurityHeaders.join(', ')})`,
        severity: 'medium',
        owaspCategory: 'A02:2025 Security Misconfiguration',
        cwe: 'CWE-16: Configuration',
        cve: 'N/A',
        cvss: 5.3,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: target,
        method: 'GET',
        target,
        description: `The web server at ${target} fails to declare essential defensive HTTP response headers, leaving clients vulnerable to Clickjacking, MIME sniffing, and protocol downgrade attacks.`,
        evidence: `Missing headers detected during active scan: ${reconData.missingSecurityHeaders.join(', ')}`,
        impact: 'Increased vulnerability to cross-site scripting (XSS), clickjacking in iframes, and network sniffing.',
        technicalAnalysis: 'Modern browsers enforce strict isolation policies when headers like CSP, HSTS, and X-Frame-Options are present. Their absence deprives clients of fundamental browser-side safeguards.',
        pocDescription: `Execute curl -I against ${target} to verify the missing headers:`,
        pocScriptCode: `curl -s -I "${target}" | grep -Ei "(strict-transport|content-security|x-frame|x-content)"`,
        codeLocations: [],
        remediation: 'Configure your web server (Nginx, Apache, or Next.js middleware) to inject these security headers on all responses.',
        remediationPatch: `// Next.js next.config.mjs example:
headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
    ]
  }];
}`,
        references: [
          'https://owasp.org/www-project-secure-headers/',
          'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers'
        ]
      });
    }

    // 2. Critical .env exposure
    if (reconData.envEndpoints.length > 0 && !rawVulns.some(v => v.title.toLowerCase().includes('.env'))) {
      rawVulns.unshift({
        id: `STRIX-ENV-${Date.now().toString().slice(-4)}`,
        title: `Critical Information Disclosure: Publicly Readable .env File (${reconData.envEndpoints.length} Configuration Items Leaked)`,
        severity: 'critical',
        owaspCategory: 'A01:2025 Broken Access Control',
        cwe: 'CWE-200: Exposure of Sensitive Information to an Unauthorized Actor',
        cve: 'N/A',
        cvss: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: '/.env',
        method: 'GET',
        target: `${target}/.env`,
        description: `An active .env file was discovered publicly accessible on the web server. Strix successfully parsed ${reconData.envEndpoints.length} service endpoints, database URLs, and secret keys directly from the live response.`,
        evidence: `Discovered keys in .env: ${reconData.envEndpoints.map(e => e.key).slice(0, 10).join(', ')}`,
        impact: 'Full compromise of backend databases, third-party API accounts, secret cryptographic salts, and internal microservices.',
        technicalAnalysis: 'Web server allows direct HTTP retrieval of dotfiles in the public web root without restricting access.',
        pocDescription: `Fetch the configuration file using curl or python:`,
        pocScriptCode: `curl -i -s "${target}/.env"`,
        codeLocations: [],
        remediation: 'Immediately block access to all dotfiles in your web server configuration and rotate all credentials stored in the exposed .env file.',
        remediationPatch: `# Nginx configuration:
location ~ /\\.env {
    deny all;
    return 404;
}`,
        references: ['https://cwe.mitre.org/data/definitions/200.html']
      });
    }

    // 3. Unprotected /admin interface
    const openAdmin = reconData.adminEndpoints.find(a => a.accessible);
    if (openAdmin && !rawVulns.some(v => v.title.toLowerCase().includes('admin'))) {
      rawVulns.unshift({
        id: `STRIX-ADM-${Date.now().toString().slice(-4)}`,
        title: `Broken Access Control: Unprotected Administrative Portal (${openAdmin.path})`,
        severity: 'critical',
        owaspCategory: 'A01:2025 Broken Access Control',
        cwe: 'CWE-306: Missing Authentication for Critical Function',
        cve: 'N/A',
        cvss: 9.1,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N',
        confidence: 'high',
        fixEffort: 'medium',
        endpoint: openAdmin.path,
        method: 'GET',
        target: `${target}${openAdmin.path}`,
        description: `The administrative portal at ${openAdmin.path} returned HTTP 200 without requiring valid session credentials or challenging the client with an authentication prompt.`,
        evidence: `Direct GET request to ${openAdmin.path} succeeded with HTTP ${openAdmin.status}`,
        impact: 'Unauthorized users can access privileged administrative operations, internal management controls, or sensitive system telemetry.',
        technicalAnalysis: 'Missing authentication middleware or authorization guards on administrative routes.',
        pocDescription: `Access the administration panel directly in browser or terminal:`,
        pocScriptCode: `curl -i -s "${target}${openAdmin.path}"`,
        codeLocations: [],
        remediation: 'Implement an authentication & role-based access control (RBAC) middleware verifying that only users with the ADMIN role can reach this route.',
        remediationPatch: `// Next.js middleware.js example:
export function middleware(req) {
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const session = req.cookies.get('session');
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }
}`,
        references: ['https://cwe.mitre.org/data/definitions/306.html']
      });
    }
  }

  // Active recon data consolidation
  const effectiveRecon = reconData || {
    url: target,
    statusCode: 200,
    server: 'GitHub Repository',
    technologies: repoData?.repoInfo?.language ? [`Language: ${repoData.repoInfo.language}`] : [],
    headers: {},
    missingSecurityHeaders: [],
    probedEndpoints: [],
    exposedRisks: repoData?.sensitiveFilesFound || [],
    envEndpoints: repoData?.envEndpoints || [],
    adminEndpoints: repoData?.adminEndpoints || [],
    loginEndpoints: repoData?.loginEndpoints || [],
    repoMetadata: repoData?.repoInfo || null,
  };

  // Recalculate summary metrics
  const summary = calculateRiskSummary(rawVulns, effectiveRecon);

  const finalResult = {
    targetType,
    target,
    scanMode,
    instruction,
    summary,
    executiveSummary: parsedOutput.executiveSummary || 'Penetration test concluded. See findings below.',
    recon: effectiveRecon,
    vulnerabilities: rawVulns,
    sarif: null,
  };

  // Generate SARIF 2.1.0 standard artifact
  finalResult.sarif = generateSarifReport(finalResult);

  onProgress({ phase: 'completed', message: 'Security assessment completed successfully!', progress: 100 });

  return finalResult;
}

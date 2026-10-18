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
  { path: '/.env', desc: 'Environment variables file' },
  { path: '/.git/HEAD', desc: 'Git repository metadata' },
  { path: '/robots.txt', desc: 'Robots crawler directives' },
  { path: '/.well-known/security.txt', desc: 'Security contact declaration' },
  { path: '/security.txt', desc: 'Security disclosure file' },
  { path: '/swagger.json', desc: 'OpenAPI / Swagger API specification' },
  { path: '/api-docs', desc: 'Interactive API documentation' },
  { path: '/admin', desc: 'Administrative control portal' },
  { path: '/api', desc: 'Base API endpoint' },
  { path: '/graphql', desc: 'GraphQL endpoint' },
];

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
  };

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

    // Detect server banner
    if (headerObj['server']) {
      reconData.server = headerObj['server'];
      reconData.technologies.push(`Server: ${headerObj['server']}`);
    }
    if (headerObj['x-powered-by']) {
      reconData.technologies.push(`Powered-By: ${headerObj['x-powered-by']}`);
      reconData.exposedRisks.push(`Server leaks technology stack via 'X-Powered-By: ${headerObj['x-powered-by']}' (CWE-200)`);
    }

    // Technology heuristics from response headers
    if (headerObj['x-nextjs-matched-path'] || headerObj['x-nextjs-page']) {
      reconData.technologies.push('Framework: Next.js');
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

  // Probe sensitive paths concurrently (max 5 at a time)
  const baseUrl = new URL(normalizedUrl).origin;
  for (const item of COMMON_SENSITIVE_PATHS) {
    try {
      const probeController = new AbortController();
      const pTimeout = setTimeout(() => probeController.abort(), 4000);
      const probeUrl = `${baseUrl}${item.path}`;

      const probeRes = await fetch(probeUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Strix-Pentest/2.0' },
        signal: probeController.signal,
      });
      clearTimeout(pTimeout);

      const accessible = probeRes.status >= 200 && probeRes.status < 300;
      let note = item.desc;
      if (accessible) {
        note = `EXPOSED! Endpoint returned HTTP ${probeRes.status}. Potential sensitive data leak.`;
        reconData.exposedRisks.push(`Sensitive endpoint publicly exposed: ${item.path} (HTTP ${probeRes.status})`);
      } else if (probeRes.status === 403 || probeRes.status === 401) {
        note = `Protected with HTTP ${probeRes.status} (Authentication required).`;
      } else {
        note = `Returned HTTP ${probeRes.status}.`;
      }

      reconData.probedEndpoints.push({
        path: item.path,
        status: probeRes.status,
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

  for (const item of treeResult.items) {
    const p = item.path.toLowerCase();
    if (p.endsWith('.env') || p.includes('.env.local') || p.includes('.env.production')) {
      sensitiveFilesFound.push(`Exposed environment file in repository: ${item.path}`);
    }
    if (p.endsWith('.pem') || p.endsWith('.key') || p.includes('id_rsa')) {
      sensitiveFilesFound.push(`Potential private key file in repository: ${item.path}`);
    }
    if (['package.json', 'requirements.txt', 'pom.xml', 'gemfile', 'go.mod', 'composer.json'].includes(item.path.split('/').pop())) {
      manifestFiles.push(item.path);
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
2. USE THE OWASP TOP 10:2025 STANDARD:
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
3. GENERATE COMPLETE, READY-TO-USE PROOF-OF-CONCEPT (PoC) CODE:
   - For every critical/high/medium vulnerability, produce a realistic exploit script (Python requests or curl commands) demonstrating how an attacker exploits the vulnerability.
4. PROVIDE PRECISE REMEDIATION & CODE PATCHES:
   - Show the exact code diff or replacement snippet that completely eliminates the vulnerability.
5. CVSS v3.1 SCORING:
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
- Probed Security Endpoints:
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
  }

  contextText += `
---
### REQUIRED JSON RESPONSE STRUCTURE:
Return a valid JSON object with the following schema:
{
  "executiveSummary": "A concise executive briefing (2-3 paragraphs) detailing overall security posture, key vulnerabilities discovered, root causes, and business risk impact.",
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
    onProgress({ phase: 'recon', message: 'Probing live target: checking headers, CORS, TLS, and probing sensitive endpoints...', progress: 25 });
    reconData = await probeWebTarget(target);
  } else if (targetType === 'repo') {
    onProgress({ phase: 'recon', message: 'Connecting to GitHub: mapping repository tree, configuration files, and dependencies...', progress: 25 });
    repoData = await probeRepoTarget(target, githubToken);
  } else {
    onProgress({ phase: 'recon', message: 'Parsing code specification and mapping attack surface...', progress: 25 });
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
  onProgress({ phase: 'exploitation', message: 'Running autonomous exploit reasoning: generating working Proof-of-Concepts (PoCs) & CVSS scoring...', progress: 65 });

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

  // If there are discovered exposed endpoints or missing headers from recon, ensure they are factored in
  if (targetType === 'url' && reconData) {
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

    const exposedHits = reconData.probedEndpoints.filter(p => p.accessible && (p.path.includes('.env') || p.path.includes('.git')));
    for (const exp of exposedHits) {
      rawVulns.unshift({
        id: `STRIX-CRIT-${Date.now().toString().slice(-4)}`,
        title: `Critical Information Disclosure: Publicly Accessible ${exp.title} (${exp.path})`,
        severity: 'critical',
        owaspCategory: 'A01:2025 Broken Access Control',
        cwe: 'CWE-200: Exposure of Sensitive Information to an Unauthorized Actor',
        cve: 'N/A',
        cvss: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        confidence: 'high',
        fixEffort: 'low',
        endpoint: exp.path,
        method: 'GET',
        target: `${target}${exp.path}`,
        description: `Direct access to ${exp.path} returned HTTP ${exp.status}, indicating sensitive configuration files or source code metadata are publicly accessible to anyone on the internet.`,
        evidence: `Direct GET probe to ${target}${exp.path} returned status ${exp.status}`,
        impact: 'Full compromise of secrets, database credentials, API keys, and source code.',
        technicalAnalysis: 'Web server allows directory indexing or fails to restrict dotfiles (.env, .git) in public document root.',
        pocDescription: `Fetch the exposed configuration directly using curl:`,
        pocScriptCode: `curl -i -s "${target}${exp.path}"`,
        codeLocations: [],
        remediation: 'Block all dotfiles in your web server configuration immediately and rotate any exposed keys.',
        remediationPatch: `# Nginx rule:
location ~ /\\.(env|git) {
    deny all;
    return 404;
}`,
        references: ['https://cwe.mitre.org/data/definitions/200.html']
      });
    }
  }

  // Recalculate summary metrics
  const summary = calculateRiskSummary(rawVulns, reconData);

  const finalResult = {
    targetType,
    target,
    scanMode,
    instruction,
    summary,
    executiveSummary: parsedOutput.executiveSummary || 'Penetration test concluded. See findings below.',
    recon: reconData || { repoMetadata: repoData?.repoInfo || null },
    vulnerabilities: rawVulns,
    sarif: null,
  };

  // Generate SARIF 2.1.0 standard artifact
  finalResult.sarif = generateSarifReport(finalResult);

  onProgress({ phase: 'completed', message: 'Security assessment completed successfully!', progress: 100 });

  return finalResult;
}

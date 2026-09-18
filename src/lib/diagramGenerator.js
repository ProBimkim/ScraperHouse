import { Groq } from 'groq-sdk';

/**
 * Initialize Groq client with API key (either from request or .env.local)
 */
export function getGroqClient(customApiKey) {
  const apiKey = (customApiKey && typeof customApiKey === 'string' ? customApiKey.trim() : '') || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API Key is not configured. Please provide a Groq API Key or set GROQ_API_KEY in .env.local (Get a free key at https://console.groq.com/keys)');
  }
  return new Groq({ apiKey });
}

/**
 * Builds the AI prompt for generating an accurate architecture diagram
 */
export function buildArchitecturePrompt({ repoInfo, treeFormatted, readmeText, keyFiles, focus }) {
  let prompt = `You are a Principal Software Architect and Mermaid.js diagram expert.
Analyze the following GitHub repository metadata, file tree structure, README documentation, and source code excerpts to create a highly accurate, clean, and comprehensive architectural system diagram.

---
### REPOSITORY INFORMATION
- Name: ${repoInfo.fullName}
- Description: ${repoInfo.description}
- Language: ${repoInfo.language}
- Stars: ${repoInfo.stars}
- Default Branch: ${repoInfo.defaultBranch}
${focus ? `- Specific Architecture Focus: "${focus}"` : ''}

---
### REPOSITORY FILE TREE
\`\`\`
${treeFormatted}
\`\`\`
`;

  if (readmeText) {
    prompt += `
---
### README DOCUMENTATION (EXCERPT)
\`\`\`markdown
${readmeText}
\`\`\`
`;
  }

  if (keyFiles && keyFiles.length > 0) {
    prompt += `
---
### KEY SOURCE CODE & CONFIG EXCERPTS
`;
    for (const file of keyFiles) {
      prompt += `
#### File: ${file.path}
\`\`\`
${file.content}
\`\`\`
`;
    }
  }

  prompt += `
---
### INSTRUCTIONS & OUTPUT REQUIREMENTS:

1. **Mermaid Diagram Code Block**:
   - Begin with a valid \`\`\`mermaid code block.
   - Use \`flowchart TD\` (or \`flowchart LR\` if horizontal layout makes more sense).
   - Group modules into meaningful \`subgraph\` containers (e.g., "Client / UI", "API Layer", "Core Business Logic", "Database / Storage", "External Services / Integrations").
   - **CRITICAL MERMAID SYNTAX RULES**:
     * NEVER put special characters (parentheses, brackets, hyphens, spaces) directly in node IDs. E.g., use \`clientApp["Client App (Next.js)"]\` NOT \`client-app(Next.js)\`.
     * ALWAYS enclose all node labels in double quotes.
     * Use meaningful label arrows, e.g., \`A -->|"REST / JSON"| B\`.
     * Do NOT use HTML tags inside node labels.
     * Ensure every subgraph has an \`end\` keyword.

2. **Architecture Breakdown**:
   Following the mermaid block, provide a clear, professional breakdown:
   - **🏛️ Architecture Overview**: Summary of the system architecture pattern (e.g., MVC, Microservices, Monolith, Serverless, Jamstack, etc.).
   - **🧩 Component Breakdown**: Short description of each major component/subgraph.
   - **🔄 Data Flow**: Step-by-step path of typical user interaction or data lifecycle.
   - **🛠️ Tech Stack & Dependencies**: Discovered frameworks, databases, and key libraries.

Ensure the output starts immediately with the \`\`\`mermaid block.`;

  return prompt;
}

/**
 * Helper to extract mermaid code from markdown response
 */
export function extractMermaidCode(text) {
  if (!text) return '';
  const match = text.match(/```mermaid\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Fallback: Check if response begins directly with graph or flowchart
  const directMatch = text.match(/((?:flowchart|graph|sequenceDiagram|classDiagram)\s+[\s\S]*)/i);
  if (directMatch) {
    return directMatch[1].trim();
  }

  return '';
}

/**
 * Sanitize mermaid code to fix common LLM formatting issues
 */
export function sanitizeMermaidCode(code) {
  if (!code) return '';
  let sanitized = code.trim();

  // Remove trailing markdown ticks if any leaked in
  sanitized = sanitized.replace(/```+$/g, '').trim();

  // Ensure starts with valid diagram type
  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram)/i.test(sanitized)) {
    sanitized = 'flowchart TD\n' + sanitized;
  }

  return sanitized;
}

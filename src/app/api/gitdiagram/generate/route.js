import {
  parseGitHubUrl,
  fetchRepoMetadata,
  fetchRepoTree,
  fetchRepoReadme,
  fetchKeyFilesContent,
  formatTreeStructure,
} from '@/lib/github';
import {
  getGroqClient,
  buildArchitecturePrompt,
  extractMermaidCode,
  sanitizeMermaidCode,
} from '@/lib/diagramGenerator';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, focus = '', token = '', groqApiKey = '' } = body;

  if (!url || typeof url !== 'string') {
    return Response.json({ error: 'GitHub repository URL is required.' }, { status: 400 });
  }

  // Set up Server-Sent Events stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type, data) {
        const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        // Step 1: Parse URL
        sendEvent('status', { message: 'Parsing repository URL...', progress: 10 });
        const { owner, repo, branch: customBranch } = parseGitHubUrl(url);

        // Step 2: Fetch Repo Metadata
        sendEvent('status', { message: `Connecting to GitHub for ${owner}/${repo}...`, progress: 20 });
        const repoInfo = await fetchRepoMetadata(owner, repo, token);
        const targetBranch = customBranch || repoInfo.defaultBranch || 'main';

        // Step 3: Fetch File Tree
        sendEvent('status', { message: `Scanning file tree on branch '${targetBranch}'...`, progress: 35 });
        const treeResult = await fetchRepoTree(owner, repo, targetBranch, token);
        const formattedTree = formatTreeStructure(treeResult.items);

        // Step 4: Fetch README & Key Files ("lebih akurat")
        sendEvent('status', { message: 'Analyzing README and reading key source code files...', progress: 50 });
        const [readmeText, keyFiles] = await Promise.all([
          fetchRepoReadme(owner, repo, targetBranch, token),
          fetchKeyFilesContent(owner, repo, targetBranch, treeResult.items, token),
        ]);

        sendEvent('status', {
          message: `Read ${keyFiles.length} key source/config files. Synthesizing architecture...`,
          progress: 65,
          analyzedFiles: keyFiles.map((f) => f.path),
        });

        // Step 5: Groq AI Stream
        sendEvent('status', { message: 'Generating Mermaid architecture diagram with Groq AI...', progress: 80 });
        const groq = getGroqClient(groqApiKey);
        const prompt = buildArchitecturePrompt({
          repoInfo,
          treeFormatted: formattedTree,
          readmeText,
          keyFiles,
          focus,
        });

        let groqStream;
        try {
          groqStream = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 4096,
            stream: true,
          });
        } catch (modelErr) {
          // Fallback to llama-3.1-8b-instant if 70b hits rate-limit or errors
          sendEvent('status', { message: 'Switching to high-speed backup AI model...', progress: 82 });
          groqStream = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 4096,
            stream: true,
          });
        }

        let fullText = '';
        for await (const chunk of groqStream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            sendEvent('chunk', { chunk: content });
          }
        }

        // Step 6: Finalize and extract diagram
        const rawMermaid = extractMermaidCode(fullText);
        const sanitizedMermaid = sanitizeMermaidCode(rawMermaid);

        sendEvent('done', {
          fullText,
          mermaid: sanitizedMermaid,
          repoInfo,
          analyzedFiles: keyFiles.map((f) => f.path),
          totalFilesScanned: treeResult.items.length,
        });

        controller.close();
      } catch (err) {
        console.error('Error generating GitDiagram:', err);
        let errorMsg = err.message || 'An unexpected error occurred while generating diagram.';
        if (err.status === 401 || errorMsg.includes('invalid_api_key') || errorMsg.includes('Invalid API Key')) {
          errorMsg = 'Groq API Key is invalid, expired, or missing. Please enter a valid Groq API Key in settings or update GROQ_API_KEY in .env.local (Get a free key at https://console.groq.com/keys)';
        }
        sendEvent('error', { message: errorMsg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

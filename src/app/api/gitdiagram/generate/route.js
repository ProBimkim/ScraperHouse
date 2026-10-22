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
  createOpenRouterDiagramStream,
  PRIMARY_DIAGRAM_MODEL,
} from '@/lib/diagramGenerator';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    url,
    focus = '',
    token = '',
    groqApiKey = '',
    openrouterApiKey = '',
    selectedModel = '',
  } = body;

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

        // Step 5: AI Stream (Primary: OpenRouter minimax/minimax-m3.1-flash:free, Fallback: Groq)
        const prompt = buildArchitecturePrompt({
          repoInfo,
          treeFormatted: formattedTree,
          readmeText,
          keyFiles,
          focus,
        });

        let fullText = '';
        let activeModelUsed = '';
        const shouldUseOpenRouter = !selectedModel || selectedModel.includes('minimax') || selectedModel.includes('openrouter');

        // 1. PRIMARY AI ATTEMPT: OpenRouter (minimax/minimax-m3.1-flash:free)
        if (shouldUseOpenRouter) {
          try {
            sendEvent('status', {
              message: `Generating architecture diagram with Primary AI (${PRIMARY_DIAGRAM_MODEL})...`,
              progress: 80,
            });

            const orBody = await createOpenRouterDiagramStream({
              prompt,
              model: PRIMARY_DIAGRAM_MODEL,
              customApiKey: openrouterApiKey,
            });

            const reader = orBody.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop();

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;
                if (trimmed === 'data: [DONE]') continue;
                if (trimmed.startsWith('data: ')) {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const chunk = parsed.choices?.[0]?.delta?.content || '';
                    if (chunk) {
                      fullText += chunk;
                      sendEvent('chunk', { chunk });
                    }
                  } catch {}
                }
              }
            }

            if (fullText.trim().length > 0) {
              activeModelUsed = PRIMARY_DIAGRAM_MODEL;
            }
          } catch (orErr) {
            console.warn(`[GitDiagram] Primary AI OpenRouter (${PRIMARY_DIAGRAM_MODEL}) encounter: ${orErr.message}. Falling back to Groq...`);
          }
        }

        // 2. FALLBACK AI ATTEMPT: Groq (if OpenRouter was unavailable or user chose a Groq model)
        if (!fullText.trim()) {
          sendEvent('status', {
            message: 'OpenRouter unavailable. Engaging Groq AI fallback...',
            progress: 80,
          });

          const groq = getGroqClient(groqApiKey);

          // Resolve active candidate models
          const preferredPriority = [
            'openai/gpt-oss-120b',
            'openai/gpt-oss-20b',
            'groq/compound',
            'groq/compound-mini',
            'llama-3.3-70b-versatile',
          ];

          const modelsToTry = [];
          if (selectedModel && selectedModel.trim() && !selectedModel.includes('minimax') && !selectedModel.includes('openrouter')) {
            modelsToTry.push(selectedModel.trim());
          }

          try {
            const listRes = await groq.models.list();
            if (listRes?.data && Array.isArray(listRes.data)) {
              const activeIds = listRes.data
                .map((m) => m.id)
                .filter((id) => id && !id.toLowerCase().includes('whisper') && !id.toLowerCase().includes('guard') && !id.toLowerCase().includes('distil'));

              for (const p of preferredPriority) {
                if (activeIds.includes(p) && !modelsToTry.includes(p)) {
                  modelsToTry.push(p);
                }
              }
              for (const id of activeIds) {
                if (!modelsToTry.includes(id)) {
                  modelsToTry.push(id);
                }
              }
            }
          } catch (err) {
            console.warn('Could not query dynamic model list from Groq:', err.message);
          }

          // Add remaining defaults as fallback
          for (const p of preferredPriority) {
            if (!modelsToTry.includes(p)) {
              modelsToTry.push(p);
            }
          }

          let groqStream = null;
          let lastModelErr = null;

          for (const modelName of modelsToTry) {
            try {
              sendEvent('status', {
                message: `Generating architecture diagram with Groq fallback (${modelName})...`,
                progress: 82,
              });

              groqStream = await groq.chat.completions.create({
                model: modelName,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 4096,
                stream: true,
              });

              activeModelUsed = modelName;
              break;
            } catch (modelErr) {
              console.warn(`Model "${modelName}" failed:`, modelErr.message);
              lastModelErr = modelErr;
            }
          }

          if (!groqStream) {
            throw lastModelErr || new Error('No accessible AI model (OpenRouter or Groq) found to generate diagram.');
          }

          for await (const chunk of groqStream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              sendEvent('chunk', { chunk: content });
            }
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
          modelUsed: activeModelUsed,
        });

        controller.close();
      } catch (err) {
        console.error('Error generating GitDiagram:', err);
        if (err.status === 401 || errorMsg.includes('invalid_api_key') || errorMsg.includes('Invalid API Key') || errorMsg.includes('API key') || errorMsg.includes('API Key')) {
          errorMsg = 'AI API Key is invalid, expired, or missing. Please configure OPENROUTER_API_KEY (primary) or GROQ_API_KEY (fallback) in .env.local or enter your key in settings.';
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

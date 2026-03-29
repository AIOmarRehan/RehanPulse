import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { env } from '@/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DEFAULT_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

/* ─── Token budgeting ─── */
const MODEL_TOKEN_LIMIT = 8192;
const MAX_RESPONSE_TOKENS = 1024;
const SAFETY_MARGIN = 100;
const INPUT_TOKEN_BUDGET = MODEL_TOKEN_LIMIT - MAX_RESPONSE_TOKENS - SAFETY_MARGIN; // ~7068

/** Rough token estimate (~3.5 chars per token for English text + code). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function POST(request: NextRequest) {
  const session = request.cookies.get('__session')?.value;
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminAuth = getAdminAuth();
    await adminAuth.verifySessionCookie(session, true);
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'AI chatbot is not configured. Set HUGGINGFACE_API_KEY in your environment.' },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessage[]; context?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { messages, context } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'Messages array is required' }, { status: 400 });
  }

  // Validate message structure and limit sizes
  const sanitizedMessages = messages
    .filter(
      (m): m is ChatMessage =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));

  if (sanitizedMessages.length === 0) {
    return Response.json({ error: 'No valid messages' }, { status: 400 });
  }

  const model = process.env.HUGGINGFACE_MODEL || DEFAULT_MODEL;

  // ── Dynamic token budgeting ──
  // 1. Measure base system prompt (without context)
  const basePrompt = buildSystemPrompt();
  const basePromptTokens = estimateTokens(basePrompt);

  // 2. Fit conversation: drop oldest messages if conversation alone exceeds budget
  let fittedMessages = sanitizedMessages;
  const msgTokens = () =>
    fittedMessages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);

  while (fittedMessages.length > 2 && basePromptTokens + msgTokens() > INPUT_TOKEN_BUDGET) {
    fittedMessages = fittedMessages.slice(1);
  }

  // 3. Remaining budget goes to context
  const contextTokenBudget = INPUT_TOKEN_BUDGET - basePromptTokens - msgTokens();
  let fittedContext: string | undefined;
  if (typeof context === 'string' && contextTokenBudget > 200) {
    const maxChars = Math.floor(contextTokenBudget * 3.5);
    fittedContext =
      context.length > maxChars
        ? context.slice(0, maxChars) + '\n[...context trimmed to fit model limit]'
        : context;
  }

  const systemPrompt = buildSystemPrompt(fittedContext);

  const fullMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...fittedMessages,
  ];

  try {
    const hfResponse = await fetch(
      'https://router.huggingface.co/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          stream: true,
          max_tokens: MAX_RESPONSE_TOKENS,
          temperature: 0.5,
        }),
      },
    );

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text().catch(() => 'Unknown error');
      console.error('HF API error:', hfResponse.status, errorText);
      return Response.json(
        { error: 'AI service unavailable. Try again later.' },
        { status: 502 },
      );
    }

    if (!hfResponse.body) {
      return Response.json(
        { error: 'No response from AI service' },
        { status: 502 },
      );
    }

    // Pipe the SSE stream from HF to the client
    const reader = hfResponse.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Failed to reach AI service' },
      { status: 502 },
    );
  }
}

function buildSystemPrompt(context?: string): string {
  let prompt = `You are Pulse, the AI assistant in RehanPulse — a real-time developer dashboard by Omar Rehan.
Stack: Next.js 14, React 18, TypeScript, Tailwind CSS, Firebase Auth+Firestore, TanStack Query, Vercel hosting.
Auth: GitHub OAuth only (no passwords). AI: Llama-3.1-8B via HuggingFace.

Dashboard has 6 sidebar pages: Dashboard (8 drag-drop widgets: commits, deployments, PRs, rate limit, Vercel overview, Vercel usage, contributions heatmap, live events), GitHub Activity (repos, commits, PRs), Deployments (stats + full list), Firebase (connect Google account, select project, view collections), Alerts (notifications + rules for push/PR/deploy/CI/issue/star events), Settings (GitHub status, webhooks, Vercel token, delete account).
Other pages: /home (public landing), /login, /policy, /terms.
UI: glass-morphism design, Command Palette (Ctrl+K), theme toggle, notification bell, Pulse AI chat (FAB bottom-right).

CRITICAL RULES:
1. Your LIVE DASHBOARD DATA section below contains the user's REAL data. ONLY quote numbers, names, URLs, and stats that appear in that section.
2. If data is missing or not shown, say "I don't see that in your current dashboard data" — NEVER invent or estimate numbers.
3. NEVER fabricate percentages, breakdowns by environment, plan limits, or details not explicitly present in the data.
4. Use Markdown formatting. Be concise (<300 words) unless asked for detail.
5. For RehanPulse questions, give exact navigation steps.
6. Features that DO NOT exist: email notifications, password auth, profile editing, billing, teams, data export, mobile app, deployment triggers, Firebase writes.`;

  if (context) {
    prompt += `\n\n--- LIVE DASHBOARD DATA ---\n${context}\n--- END DASHBOARD DATA ---`;
  } else {
    prompt += `\n\nNo dashboard data loaded yet. Answer general questions about RehanPulse and programming only. Do not guess any numbers.`;
  }

  return prompt;
}

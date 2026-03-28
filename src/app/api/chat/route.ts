import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { env } from '@/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DEFAULT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';

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
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (sanitizedMessages.length === 0) {
    return Response.json({ error: 'No valid messages' }, { status: 400 });
  }

  const model = process.env.HUGGINGFACE_MODEL || DEFAULT_MODEL;
  const systemPrompt = buildSystemPrompt(
    typeof context === 'string' ? context.slice(0, 8000) : undefined,
  );

  const fullMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...sanitizedMessages,
  ];

  try {
    const hfResponse = await fetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: fullMessages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.7,
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
  let prompt = `You are Pulse, an AI assistant embedded in RehanPulse, a developer dashboard that monitors GitHub repositories, Vercel deployments, and Firebase services.

Your role:
- Help the user understand their project data, deployment statuses, and GitHub activity.
- Explain errors, failed deployments, and suggest fixes.
- Provide concise, actionable answers.
- Reference specific data when available (repo names, deployment URLs, commit messages).

Guidelines:
- Be concise and direct. No filler.
- Use technical language appropriate for a software developer.
- When data is available, cite specific numbers, names, and statuses.
- If you lack context to answer, say so.
- Format responses with markdown when helpful (code blocks, lists, bold).`;

  if (context) {
    prompt += `\n\nThe user's current dashboard data:\n${context}`;
  }

  return prompt;
}

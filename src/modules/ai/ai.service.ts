import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AiChatTurnDto } from './dto/ai-chat-stream.dto';

const KEE_TRA_SYSTEM = `You are KeeTra AI, the assistant inside the KeeTra collaboration product. Help individuals and businesses with:
- Clear explanations, planning, research-style reasoning, and operational advice
- Writing and editing: documents, memos, emails, letters, proposals, marketing, HR, and customer-facing text
- Proofreading, grammar, tone adjustments, and rewriting for clarity and professionalism
- Software: provide copy-ready code in fenced markdown blocks with a language tag (e.g. \`\`\`typescript). Give short context when it helps. The KeeTra UI can export replies and code as PDF, Word (.docx), Markdown, or copy to the clipboard.

Be accurate and honest about uncertainty. You cannot browse the live web or access private user data unless the user pastes it. Prefer concise answers unless the user asks for depth.`;

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService) {}

  async proxyChatStream(turns: AiChatTurnDto[], res: Response): Promise<void> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'KeeTra AI is not configured (missing OPENAI_API_KEY).',
      );
    }

    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: KEE_TRA_SYSTEM },
          ...turns.map((t) => ({ role: t.role, content: t.content })),
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new BadGatewayException(
        errText ? errText.slice(0, 4000) : `OpenAI returned ${upstream.status}`,
      );
    }

    if (!upstream.body) {
      throw new BadGatewayException('Empty response body from OpenAI');
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const nodeReadable = Readable.fromWeb(
      upstream.body as import('stream/web').ReadableStream<Uint8Array>,
    );
    await pipeline(nodeReadable, res);
  }

  private requireOpenAiKey(): string {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'KeeTra AI is not configured (missing OPENAI_API_KEY).',
      );
    }
    return apiKey;
  }

  private interviewModelId(): string {
    return (
      this.config.get<string>('JOB_INTERVIEW_MODEL')?.trim() ||
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      'gpt-4o-mini'
    );
  }

  /** Non-streaming JSON object completion (used by job interviews). */
  async completeJsonObject(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<Record<string, unknown>> {
    const apiKey = this.requireOpenAiKey();
    const model = this.interviewModelId();
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.35,
      }),
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new BadGatewayException(
        errText ? errText.slice(0, 4000) : `OpenAI returned ${upstream.status}`,
      );
    }
    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new BadGatewayException('Empty JSON completion');
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException('Model returned invalid JSON');
    }
  }

  async jobInterviewOpening(params: {
    jobTitle: string;
    requirementsText: string;
    candidateName: string;
  }): Promise<string> {
    const obj = await this.completeJsonObject([
      {
        role: 'system',
        content: `You conduct a structured job interview. Output strictly JSON with key "opening" (string): a brief professional greeting and ONE first interview question tailored to the job. Do not ask for legally sensitive traits (race, religion, health, etc.).`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          jobTitle: params.jobTitle,
          requirementsText: params.requirementsText.slice(0, 12_000),
          candidateName: params.candidateName,
        }),
      },
    ]);
    const opening = obj['opening'];
    if (typeof opening !== 'string' || !opening.trim()) {
      throw new BadGatewayException('Invalid interview opening from model');
    }
    return opening.trim();
  }

  async jobInterviewNextTurn(params: {
    jobTitle: string;
    requirementsText: string;
    transcript: string;
    maxQuestions: number;
    userTurnsSoFar: number;
  }): Promise<{ assistantMessage: string; interviewComplete: boolean }> {
    const atCap = params.userTurnsSoFar >= params.maxQuestions;
    const obj = await this.completeJsonObject([
      {
        role: 'system',
        content: `You are an interviewer. Reply with strictly JSON keys:
"assistantMessage" (string, one follow-up or closing message),
"interviewComplete" (boolean).

The candidate has answered ${params.userTurnsSoFar} question(s); the interview allows at most ${params.maxQuestions} candidate answers. If ${atCap ? 'they have reached the cap' : 'you have enough signal or they are near the cap'}, set interviewComplete true and close politely with no new question. Otherwise ask exactly one focused next question.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          jobTitle: params.jobTitle,
          requirementsText: params.requirementsText.slice(0, 8000),
          transcript: params.transcript.slice(0, 60_000),
          maxQuestions: params.maxQuestions,
          userTurnsSoFar: params.userTurnsSoFar,
        }),
      },
    ]);
    const assistantMessage = obj['assistantMessage'];
    const interviewComplete = obj['interviewComplete'];
    if (typeof assistantMessage !== 'string' || !assistantMessage.trim()) {
      throw new BadGatewayException('Invalid interviewer reply from model');
    }
    return {
      assistantMessage: assistantMessage.trim(),
      interviewComplete: Boolean(interviewComplete),
    };
  }

  async jobInterviewGrade(params: {
    jobTitle: string;
    requirementsText: string;
    transcript: string;
    proctoringFlags: Record<string, number>;
  }): Promise<{
    criteria: { id: string; score: number; note: string }[];
    strengths: string[];
    gaps: string[];
    overallSummary: string;
  }> {
    const obj = await this.completeJsonObject([
      {
        role: 'system',
        content: `You assess a candidate interview for hiring *signals only* (not a legal decision). Return strictly JSON with:
"criteria": array of { "id": string, "score": number 1-5, "note": string } (4-6 criteria aligned to the job),
"strengths": string[] (max 5 short bullets),
"gaps": string[] (max 5 short bullets),
"overallSummary": string (2-4 sentences).

Use only the transcript and job requirements. Proctoring flag counts are weak heuristics (not proof of cheating); mention cautiously in overallSummary if relevant.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          jobTitle: params.jobTitle,
          requirementsText: params.requirementsText.slice(0, 12_000),
          transcript: params.transcript.slice(0, 80_000),
          proctoringFlags: params.proctoringFlags,
        }),
      },
    ]);
    const criteriaRaw = obj['criteria'];
    const strengths = obj['strengths'];
    const gaps = obj['gaps'];
    const overallSummary = obj['overallSummary'];
    if (!Array.isArray(criteriaRaw) || typeof overallSummary !== 'string') {
      throw new BadGatewayException('Invalid grading JSON from model');
    }
    const criteria = criteriaRaw.map((c: unknown) => {
      const row = c as { id?: unknown; score?: unknown; note?: unknown };
      return {
        id: String(row.id ?? 'unknown'),
        score: Number(row.score),
        note: String(row.note ?? ''),
      };
    });
    return {
      criteria,
      strengths: Array.isArray(strengths) ? strengths.map(String) : [],
      gaps: Array.isArray(gaps) ? gaps.map(String) : [],
      overallSummary: overallSummary.trim(),
    };
  }
}

export const dynamic = 'force-dynamic';

import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, AssistantModelMessage } from 'ai';
import { streamResponse, verifySignature } from '@layercode/node-server-sdk';
import { kv } from '@vercel/kv';
import { getNPC, NPCs } from '@/app/game/npcs';

type LayercodeMetadata = {
  conversation_id: string;
};

type LayercodePart = {
  content: string;
};

type LayercodeUIMessage = UIMessage<LayercodeMetadata, LayercodePart>;

type SessionContext = {
  npc_id?: string;
};

type WebhookRequest = {
  conversation_id: string;
  text: string;
  turn_id: string;
  type: 'message' | 'session.start' | 'session.end' | 'session.update';
  session_context?: SessionContext;
};

const DEFAULT_NPC_ID = 'elder_oak';
const DEFAULT_NPC = NPCs[DEFAULT_NPC_ID];

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const CONVERSATION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const isKvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const inMemoryConversations = new Map<string, LayercodeUIMessage[]>();
const inMemoryNpcMapping = new Map<string, string>();
let kvWarningShown = false;

const conversationKey = (conversationId: string) => `layercode:conversation:${conversationId}`;
const npcKey = (conversationId: string) => `layercode:npc:${conversationId}`;

const warnAboutKvFallback = () => {
  if (isKvConfigured || kvWarningShown) return;
  kvWarningShown = true;
  console.warn('Vercel KV environment variables are missing; falling back to in-memory message storage.');
};

const getConversationMessages = async (conversationId: string): Promise<LayercodeUIMessage[]> => {
  if (!isKvConfigured) {
    warnAboutKvFallback();
    return inMemoryConversations.get(conversationId) ?? [];
  }
  const key = conversationKey(conversationId);
  const stored = await kv.lrange<string>(key, 0, -1);
  if (!stored?.length) return [];
  return stored.map((entry) => JSON.parse(entry) as LayercodeUIMessage);
};

const appendConversationMessages = async (conversationId: string, messages: LayercodeUIMessage[]) => {
  if (!messages.length) return;
  if (!isKvConfigured) {
    warnAboutKvFallback();
    const existing = inMemoryConversations.get(conversationId) ?? [];
    inMemoryConversations.set(conversationId, [...existing, ...messages]);
    return;
  }
  const key = conversationKey(conversationId);
  await kv.rpush(key, ...messages.map((message) => JSON.stringify(message)));
  await kv.expire(key, CONVERSATION_TTL_SECONDS);
};

const resetConversationMessages = async (conversationId: string) => {
  if (!isKvConfigured) {
    warnAboutKvFallback();
    inMemoryConversations.delete(conversationId);
    return;
  }
  await kv.del(conversationKey(conversationId));
};

const setConversationNpc = async (conversationId: string, npcId: string) => {
  if (!isKvConfigured) {
    warnAboutKvFallback();
    inMemoryNpcMapping.set(conversationId, npcId);
    return;
  }
  await kv.set(npcKey(conversationId), npcId, { ex: CONVERSATION_TTL_SECONDS });
};

const getConversationNpc = async (conversationId: string): Promise<string> => {
  if (!isKvConfigured) {
    warnAboutKvFallback();
    return inMemoryNpcMapping.get(conversationId) ?? DEFAULT_NPC_ID;
  }
  const stored = await kv.get<string>(npcKey(conversationId));
  return stored ?? DEFAULT_NPC_ID;
};

export const POST = async (request: Request) => {
  const requestBody = (await request.json()) as WebhookRequest;
  console.log('Webhook received from Layercode', requestBody);

  // Verify webhook signature
  const signature = request.headers.get('layercode-signature') || '';
  const secret = process.env.LAYERCODE_WEBHOOK_SECRET || '';
  const isValid = verifySignature({
    payload: JSON.stringify(requestBody),
    signature,
    secret
  });
  if (!isValid) return new Response('Invalid layercode-signature', { status: 401 });

  const { conversation_id, text: userText, turn_id, type, session_context } = requestBody;

  // Get NPC ID from session context or stored mapping
  let npcId = session_context?.npc_id;

  if (type === 'session.start') {
    await resetConversationMessages(conversation_id);
    if (npcId) {
      await setConversationNpc(conversation_id, npcId);
    }
  }

  // If no NPC ID in session context, get from storage
  if (!npcId) {
    npcId = await getConversationNpc(conversation_id);
  }

  const npc = getNPC(npcId) ?? DEFAULT_NPC;
  console.log(`Using NPC: ${npc.name} (${npc.id})`);

  const existingMessages = await getConversationMessages(conversation_id);

  const userMessage: LayercodeUIMessage = {
    id: turn_id,
    role: 'user',
    metadata: { conversation_id },
    parts: [{ type: 'text', text: userText }]
  };
  await appendConversationMessages(conversation_id, [userMessage]);

  switch (type) {
    case 'session.start':
      const message: LayercodeUIMessage = {
        id: turn_id,
        role: 'assistant',
        metadata: { conversation_id },
        parts: [{ type: 'text', text: npc.welcomeMessage }]
      };

      return streamResponse(requestBody, async ({ stream }) => {
        await appendConversationMessages(conversation_id, [message]);
        stream.tts(npc.welcomeMessage);
        stream.end();
      });

    case 'message':
      return streamResponse(requestBody, async ({ stream }) => {
        const conversationForModel = [...existingMessages, userMessage];

        const { textStream } = streamText({
          model: openai('gpt-4o-mini'),
          system: npc.systemPrompt,
          messages: convertToModelMessages(conversationForModel),
          onFinish: async ({ response }) => {
            const generatedMessages: LayercodeUIMessage[] = response.messages
              .filter((message): message is AssistantModelMessage => message.role === 'assistant')
              .map((message) => ({
                id: crypto.randomUUID(),
                role: 'assistant',
                metadata: { conversation_id },
                parts: Array.isArray(message.content)
                  ? message.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map((part) => ({ type: 'text', text: part.text }))
                  : [{ type: 'text', text: message.content }]
              }));

            await appendConversationMessages(conversation_id, generatedMessages);
            stream.end();
          }
        });

        await stream.ttsTextStream(textStream);
      });

    case 'session.end':
    case 'session.update':
      return new Response('OK', { status: 200 });
  }
};

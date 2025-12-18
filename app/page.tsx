'use client';

import { Activity, Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NPC } from './game/npcs';

type Role = 'user' | 'assistant' | 'system';

type TranscriptChunk = {
  counter: number;
  text: string;
};

type TurnChunkMap = Map<string, Map<number, string>>;

type Message = {
  role: Role;
  text: string;
  turnId?: string;
  chunks?: TranscriptChunk[];
};

type AgentEvent = {
  type?: string;
  turn_id?: string | number;
  delta_counter?: number | string;
  content?: string;
};

const GamePage = dynamic(
  async () => {
    const { useLayercodeAgent, MicrophoneSelect } = await import('@layercode/react-sdk');
    const { GameWorld } = await import('./game/GameWorld');

    function Game() {
      const agentId = process.env.NEXT_PUBLIC_LAYERCODE_AGENT_ID ?? '';

      const [messages, setMessages] = useState<Message[]>([]);
      const [isSessionActive, setIsSessionActive] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const [selectedNpc, setSelectedNpc] = useState<NPC | null>(null);
      const userChunksByTurn = useRef<TurnChunkMap>(new Map());
      const listRef = useRef<HTMLDivElement | null>(null);
      const npcIdRef = useRef<string | null>(null);

      const appendSystemMessage = useCallback((text: string) => {
        setMessages((prev) => [...prev, { role: 'system', text }]);
      }, []);

      const upsertMessage = useCallback((next: Message, opts: { replace?: boolean } = {}) => {
        setMessages((prev) => {
          if (!next.turnId) return [...prev, next];

          const index = prev.findIndex((msg) => msg.turnId === next.turnId && msg.role === next.role);
          if (index === -1) return [...prev, next];

          const copy = prev.slice();
          const current = copy[index];
          copy[index] = {
            ...current,
            text: opts.replace ? next.text : current.text + next.text,
            chunks: next.chunks ?? current.chunks
          };
          return copy;
        });
      }, []);

      const clearTurn = useCallback((turnId: string) => {
        userChunksByTurn.current.delete(turnId);
      }, []);

      const updateUserTranscript = useCallback(
        (event: AgentEvent) => {
          const turnId = event.turn_id != null ? String(event.turn_id) : undefined;
          const rawCounter = event.delta_counter;
          const content = typeof event.content === 'string' ? event.content : '';

          const counter = typeof rawCounter === 'number' ? rawCounter : rawCounter != null ? Number(rawCounter) : undefined;

          if (!turnId || counter === undefined) {
            if (turnId) clearTurn(turnId);
            upsertMessage(
              {
                role: 'user',
                turnId,
                text: content,
                chunks: []
              },
              { replace: true }
            );
            return;
          }

          const turnMap = userChunksByTurn.current.get(turnId) ?? new Map<number, string>();
          turnMap.set(counter, content);
          userChunksByTurn.current.set(turnId, turnMap);

          const chunks: TranscriptChunk[] = [...turnMap.entries()].sort(([a], [b]) => a - b).map(([c, text]) => ({ counter: c, text }));
          const aggregatedText = chunks.map((chunk) => chunk.text).join('');

          upsertMessage(
            {
              role: 'user',
              turnId,
              text: aggregatedText,
              chunks
            },
            { replace: true }
          );
        },
        [clearTurn, upsertMessage]
      );

      const appendAssistantMessage = useCallback(
        (event: AgentEvent) => {
          const text = typeof event.content === 'string' ? event.content : '';
          upsertMessage({
            role: 'assistant',
            turnId: event.turn_id != null ? String(event.turn_id) : undefined,
            text
          });
        },
        [upsertMessage]
      );

      const handleAgentMessage = useCallback(
        (evt: AgentEvent) => {
          const type = evt.type;
          if (!type) return;

          if (type === 'turn.end' && evt.turn_id != null) {
            clearTurn(String(evt.turn_id));
            return;
          }

          if (type === 'user.transcript.delta' || type === 'user.transcript.interim_delta') {
            updateUserTranscript(evt);
            return;
          }

          if (type === 'response.text') {
            appendAssistantMessage(evt);
          }
        },
        [appendAssistantMessage, clearTurn, updateUserTranscript]
      );

      const agent = useLayercodeAgent({
        agentId,
        authorizeSessionEndpoint: '/api/authorize',
        authorizeSessionRequestBody: {
          npc_id: npcIdRef.current || 'elder_oak'
        },
        enableAmplitudeMonitoring: false,
        onConnect: () => {
          setIsSessionActive(true);
          if (selectedNpc) {
            appendSystemMessage(`Connected to ${selectedNpc.name}`);
          }
        },
        onDisconnect: () => {
          setIsSessionActive(false);
          userChunksByTurn.current.clear();
          appendSystemMessage('Conversation ended');
        },
        onError: (err) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (errorMessage.includes('insufficient_balance') || errorMessage.includes('402')) {
            setError('Your organization has insufficient funds. Please add funds to your Layercode account to continue.');
          } else {
            setMessages((prev) => [...prev, { role: 'system', text: `Error: ${errorMessage}` }]);
          }
        },
        onMessage: handleAgentMessage
      });

      const { status, connect, disconnect, mute, unmute, isMuted, agentSpeaking, userSpeaking } = agent;

      useEffect(() => {
        return () => {
          void disconnect();
        };
      }, [disconnect]);

      useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth'
        });
      }, [messages]);

      const isConnecting = status === 'connecting';

      const handleNpcInteract = useCallback(async (npc: NPC) => {
        if (isSessionActive || isConnecting) return;

        setSelectedNpc(npc);
        npcIdRef.current = npc.id;
        setMessages([]);
        setError(null);
        userChunksByTurn.current.clear();

        try {
          await connect();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setMessages([{ role: 'system', text: `Failed to connect: ${errorMessage}` }]);
        }
      }, [isSessionActive, isConnecting, connect]);

      const handleDisconnect = useCallback(() => {
        disconnect();
        setSelectedNpc(null);
        npcIdRef.current = null;
      }, [disconnect]);

      const handleMicClick = () => {
        if (!isSessionActive) return;
        isMuted ? unmute() : mute();
      };

      const getRoleLabel = (role: Role) => {
        if (role === 'assistant') {
          return selectedNpc?.name ?? 'NPC';
        }
        return role === 'user' ? 'You' : 'System';
      };

      return (
        <div className="min-h-screen bg-neutral-950 text-white p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <header className="mb-6 text-center">
              <h1 className="text-3xl font-bold text-emerald-400 mb-2">Village of Voices</h1>
              <p className="text-neutral-400">Walk around and talk to the villagers using your voice!</p>
            </header>

            {error && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="ml-4 text-red-300 hover:text-red-100"
                  aria-label="Dismiss error"
                >
                  &times;
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Game World */}
              <section className="rounded-xl border border-neutral-800 bg-black/30 p-5">
                <h2 className="text-lg font-semibold mb-4 text-neutral-200">Game World</h2>
                <div className="flex justify-center">
                  <GameWorld
                    onNpcInteract={handleNpcInteract}
                    selectedNpcId={selectedNpc?.id ?? null}
                    isConnected={isSessionActive}
                  />
                </div>
              </section>

              {/* Chat Panel */}
              <section className="rounded-xl border border-neutral-800 bg-black/30 p-5 flex flex-col">
                {/* NPC Info */}
                {selectedNpc ? (
                  <div className="mb-4 p-3 rounded-lg border border-neutral-700 bg-neutral-900/50">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: selectedNpc.color }}
                      >
                        {selectedNpc.name[0]}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{selectedNpc.name}</h3>
                        <p className="text-xs text-neutral-400 capitalize">{selectedNpc.personality}</p>
                      </div>
                      {isSessionActive && (
                        <div className="ml-auto flex items-center gap-2">
                          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-xs text-emerald-400">Connected</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 p-4 rounded-lg border border-dashed border-neutral-700 bg-neutral-900/30 text-center">
                    <p className="text-neutral-500">Walk up to a villager and press SPACE to start a conversation</p>
                  </div>
                )}

                {/* Voice Controls */}
                {isSessionActive && (
                  <div className="mb-4 space-y-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md border border-red-700 bg-red-900/30 px-4 py-2 text-white transition hover:bg-red-900/50"
                      >
                        <PhoneOff className="h-4 w-4 text-red-400" />
                        <span>End Chat</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleMicClick}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-900/50 px-4 py-2 text-white transition hover:border-neutral-500"
                      >
                        {isMuted ? (
                          <>
                            <MicOff className="h-4 w-4 text-red-400" />
                            <span>Unmute</span>
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4 text-emerald-400" />
                            <span>Mute</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Speaking indicators */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        userSpeaking ? 'border-emerald-500/60 bg-emerald-500/10 text-white' : 'border-neutral-800 bg-neutral-900/40 text-neutral-400'
                      }`}>
                        <Mic className={`h-4 w-4 ${userSpeaking ? 'text-emerald-300' : 'text-neutral-500'}`} />
                        <span>You</span>
                        <span className={`ml-auto inline-flex h-2 w-2 rounded-full ${userSpeaking ? 'animate-pulse bg-emerald-300' : 'bg-neutral-700'}`} />
                      </div>
                      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        agentSpeaking ? 'border-emerald-500/60 bg-emerald-500/10 text-white' : 'border-neutral-800 bg-neutral-900/40 text-neutral-400'
                      }`}>
                        <Activity className={`h-4 w-4 ${agentSpeaking ? 'text-emerald-300' : 'text-neutral-500'}`} />
                        <span>{selectedNpc?.name ?? 'NPC'}</span>
                        <span className={`ml-auto inline-flex h-2 w-2 rounded-full ${agentSpeaking ? 'animate-pulse bg-emerald-300' : 'bg-neutral-700'}`} />
                      </div>
                    </div>

                    <MicrophoneSelect
                      agent={agent}
                      helperText="Select microphone"
                      className="w-full rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                      containerClassName="space-y-1"
                    />
                  </div>
                )}

                {/* Conversation */}
                <div className="flex-1 min-h-0">
                  <div className="mb-2 text-sm text-neutral-400">Conversation</div>
                  <div
                    ref={listRef}
                    className="h-64 lg:h-80 w-full overflow-y-auto rounded-md border border-neutral-900 bg-neutral-950/40 p-3 text-sm"
                  >
                    {messages.length === 0 ? (
                      <div className="text-neutral-500">
                        {selectedNpc
                          ? `Connecting to ${selectedNpc.name}...`
                          : 'No conversation yet. Talk to a villager to begin!'}
                      </div>
                    ) : (
                      messages.map((message, index) => (
                        <div key={`${message.turnId ?? message.role}-${index}`} className="mb-3 leading-relaxed">
                          <span
                            className="text-sm font-medium"
                            style={{
                              color: message.role === 'assistant' && selectedNpc ? selectedNpc.color : '#9ca3af'
                            }}
                          >
                            {getRoleLabel(message.role)}:
                          </span>{' '}
                          <span className="whitespace-pre-wrap text-neutral-100">
                            {message.role === 'user' && message.chunks?.length
                              ? message.chunks.map((chunk) => <span key={chunk.counter}>{chunk.text}</span>)
                              : message.text}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Instructions */}
            <footer className="mt-6 text-center text-sm text-neutral-500">
              <p>Use <kbd className="px-2 py-1 bg-neutral-800 rounded text-neutral-300">WASD</kbd> or <kbd className="px-2 py-1 bg-neutral-800 rounded text-neutral-300">Arrow Keys</kbd> to move around the village.</p>
              <p className="mt-1">Press <kbd className="px-2 py-1 bg-neutral-800 rounded text-neutral-300">SPACE</kbd> near a villager to start a voice conversation.</p>
            </footer>
          </div>
        </div>
      );
    }

    return Game;
  },
  { ssr: false }
);

export default GamePage;

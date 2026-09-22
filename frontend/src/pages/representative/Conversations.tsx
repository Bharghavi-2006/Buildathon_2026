import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, MessageSquare, Send } from 'lucide-react';
import { representativeApi } from '../../api/representative';
import { conversationsApi } from '../../api/conversations';
import { StatusBadge } from '../../components/ui/StatusBadge';

const ConversationThread: React.FC<{ item: any; paused: boolean }> = ({ item, paused }) => {
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const conversationId = item.conversation.id;
  const { data: messages, isLoading } = useQuery({ queryKey: ['rep-conversation-messages', conversationId], queryFn: () => conversationsApi.getMessages(conversationId) });
  const reply = useMutation({
    mutationFn: () => conversationsApi.sendReply(conversationId, draft),
    onSuccess: () => { setDraft(''); client.invalidateQueries({ queryKey: ['rep-conversation-messages', conversationId] }); client.invalidateQueries({ queryKey: ['rep-workspace'] }); },
  });
  const replyError = reply.isError ? (reply.error as any)?.message || 'Failed to send reply' : null;
  return (
    <div className="border-t border-purple-500/10 bg-[#070811] p-4 space-y-3">
      {paused && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/20 border border-amber-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Campaign paused — you can finish this conversation, but no new prospects will enter this campaign until resumed.
        </div>
      )}
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {isLoading && <p className="text-xs text-slate-500">Loading messages…</p>}
        {messages?.map((m: any) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${m.direction === 'INBOUND' ? 'bg-[#12152d] text-slate-200' : 'bg-purple-900/40 text-purple-100 ml-auto'}`}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{m.direction === 'INBOUND' ? 'Prospect' : 'You'} · {m.channel}</div>
            {m.content}
          </div>
        ))}
        {messages && messages.length === 0 && <p className="text-xs text-slate-500">No messages yet.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a reply…"
          className="flex-1 bg-[#0d0f22] border border-purple-500/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500"
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) reply.mutate(); }}
        />
        <button
          disabled={!draft.trim() || reply.isPending}
          onClick={() => reply.mutate()}
          className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />Reply
        </button>
      </div>
      {replyError && <p className="text-[11px] text-rose-300">{replyError}</p>}
    </div>
  );
};

export const RepresentativeConversations: React.FC = () => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['rep-workspace'], queryFn: representativeApi.workspace, refetchInterval: 15000 });
  if (isLoading) return <div className="text-slate-400">Loading conversations…</div>;
  if (error || !data) return <div className="text-rose-300">Unable to load your assigned workspace.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Conversations</h1>
        <p className="text-sm text-slate-400">Live back-and-forth with prospects across your assigned campaigns.</p>
      </div>
      <div className="space-y-3">
        {(data.conversations || []).map((item: any) => {
          const paused = item.campaign.status === 'PAUSED';
          const isOpen = expanded === item.conversation.id;
          return (
            <div key={item.conversation.id} className="rounded-xl border border-purple-500/15 bg-[#0d0f22] overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : item.conversation.id)} className="w-full flex justify-between p-4 text-left">
                <div>
                  <div className="font-semibold text-white">{item.prospect.first_name} {item.prospect.last_name}</div>
                  <div className="text-xs text-slate-400 mt-1">{item.campaign.name} · {item.prospect.title}</div>
                  {paused && <p className="text-xs text-amber-300 mt-2">Campaign paused — you can finish this conversation, but no new prospects will enter.</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.conversation.status} />
                  <MessageSquare className="w-4 h-4 text-purple-300" />
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {isOpen && <ConversationThread item={item} paused={paused} />}
            </div>
          );
        })}
        {!(data.conversations || []).length && <p className="text-slate-400">No assigned conversations.</p>}
      </div>
    </div>
  );
};

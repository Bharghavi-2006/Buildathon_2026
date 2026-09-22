import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, Trash2, Upload } from 'lucide-react';
import { campaignsApi } from '../../../api/campaigns';

interface Step6KnowledgeProps {
  campaignId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const Step6Knowledge: React.FC<Step6KnowledgeProps> = ({
  campaignId,
  onBack,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');
  const kbFileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: knowledgeDocs = [] } = useQuery({
    queryKey: ['campaign-knowledge', campaignId],
    queryFn: () => campaignsApi.getKnowledge(campaignId),
    enabled: !!campaignId,
  });
  const addKnowledgeMutation = useMutation({
    mutationFn: () => campaignsApi.addKnowledge(campaignId, kbTitle.trim(), kbContent.trim()),
    onSuccess: () => {
      setKbTitle(''); setKbContent('');
      queryClient.invalidateQueries({ queryKey: ['campaign-knowledge', campaignId] });
    },
  });
  const removeKnowledgeMutation = useMutation({
    mutationFn: (docId: string) => campaignsApi.removeKnowledge(campaignId, docId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign-knowledge', campaignId] }),
  });
  const handleKbFileChosen = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setKbTitle((prev) => prev || file.name.replace(/\.(txt|md)$/i, ''));
      setKbContent(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-serif italic font-medium text-white tracking-tight">Knowledge Base & RAG Context</h2>
        <p className="text-xs text-slate-400 mt-1">
          Upload or paste reference material for this campaign. The Personalization agent retrieves the most relevant documents when drafting outreach. This step is optional — you can continue with no documents.
        </p>
      </div>

      <div className="bg-[#0c0e1f] border border-[#7C3AED] rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2.5 border-b border-purple-500/10 pb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Campaign Knowledge Base</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Paste text or drop a .txt/.md file. Each document is stored and scoped to this campaign only.
            </p>
          </div>
        </div>

        {knowledgeDocs.length > 0 && (
          <div className="divide-y divide-purple-500/5 border border-[#7C3AED] rounded-xl overflow-hidden">
            {knowledgeDocs.map((doc) => (
              <div key={doc.id} className="flex items-start justify-between gap-3 p-3 bg-[#070811]">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">{doc.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{doc.content}</div>
                </div>
                <button
                  onClick={() => removeKnowledgeMutation.mutate(doc.id)}
                  disabled={removeKnowledgeMutation.isPending}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 transition-colors flex-shrink-0"
                  title="Remove document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 bg-[#070811] border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <input
              value={kbTitle}
              onChange={(e) => setKbTitle(e.target.value)}
              placeholder="Document title (e.g. Objection Handling)"
              className="flex-1 min-w-[200px] px-3 py-2 bg-[#0c0e1f] border border-purple-500/20 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => kbFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-purple-500/20 bg-[#0c0e1f] hover:border-purple-500/50 text-slate-300 text-xs font-semibold transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Upload .txt/.md
            </button>
            <input
              ref={kbFileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleKbFileChosen(f); e.target.value = ''; }}
            />
          </div>
          <textarea
            rows={4}
            value={kbContent}
            onChange={(e) => setKbContent(e.target.value)}
            placeholder="Paste the reference text here, or upload a file above to fill this in..."
            className="w-full px-3 py-2 bg-[#0c0e1f] border border-purple-500/20 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!kbTitle.trim() || !kbContent.trim() || addKnowledgeMutation.isPending}
              onClick={() => addKnowledgeMutation.mutate()}
              className="px-3.5 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 disabled:opacity-40 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg transition-all"
            >
              Add to Knowledge Base
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Channels & Prompts
        </button>

        <button
          type="button"
          onClick={onSuccess}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30"
        >
          <span>Continue to Assign Reps</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

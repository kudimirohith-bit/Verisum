import React, { useState, useRef } from 'react';
import { JobStatusResponse } from '../api/client';
import { QualityPanel } from './QualityPanel';
import { FlaggedClaimHighlight } from './FlaggedClaimHighlight';
import { FeedbackForm } from './FeedbackForm';
import { FileText, Cpu, Eye, Sparkles } from 'lucide-react';

interface SummaryReviewScreenProps {
  jobResult: JobStatusResponse;
  userRole: 'clinician' | 'researcher' | 'admin';
  onBackToUpload: () => void;
}

export const SummaryReviewScreen: React.FC<SummaryReviewScreenProps> = ({
  jobResult,
  userRole,
  onBackToUpload,
}) => {
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const mountedTimeRef = useRef<number>(Date.now());

  const summary = jobResult.summary;
  const existingFeedback = jobResult.feedback?.[0];

  const documents = jobResult.documents || [];
  const [activeDocIndex, setActiveDocIndex] = useState(0);

  const currentDoc = documents[activeDocIndex] || documents[0];
  const rawText = currentDoc?.rawText || 'No source document text available.';

  // Naive chunking for source document representation
  const paragraphs = rawText.split(/\n\n+/).filter(Boolean);

  const handleSelectSourceChunk = (chunkId: string) => {
    setSelectedChunkId(chunkId);
    // Smooth scroll to chunk element if present
    const el = window.document.getElementById(`source-chunk-${chunkId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (!summary) {
    return (
      <div className="text-center py-16 text-slate-400 space-y-4">
        <div>No summary output available for this job.</div>
        <button
          onClick={onBackToUpload}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-xl"
        >
          Return to Upload
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300" data-testid="summary-review-screen">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <Sparkles className="w-4 h-4" /> Factual Consistency Review & Feedback
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mt-1">
            Clinical Summary Evaluation
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900 text-xs text-slate-300 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>Backend: <strong>{jobResult.job.modelBackend}</strong></span>
          </div>
          <button
            onClick={onBackToUpload}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            New Job
          </button>
        </div>
      </div>

      {/* Main Side-by-Side Dual Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: Source Document View */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-4 shadow-xl">
            <div className="flex flex-col gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Source Document(s) ({documents.length})</span>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {currentDoc?.docType || 'Clinical Note'}
                </div>
              </div>

              {/* Multi-document Tabs */}
              {documents.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {documents.map((doc, idx) => (
                    <button
                      key={doc._id}
                      onClick={() => setActiveDocIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                        activeDocIndex === idx
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/50'
                      }`}
                    >
                      Doc #{idx + 1}: {doc.sourceFilename || `Document ${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Source Content Panes */}
            <div className="max-h-[650px] overflow-y-auto pr-2 space-y-4 font-mono text-xs text-slate-300 leading-relaxed">
              {paragraphs.map((pText, idx) => {
                const chunkId = `chunk-${idx + 1}`;
                const isSelected = selectedChunkId === chunkId || selectedChunkId?.includes(`${idx + 1}`);

                return (
                  <div
                    key={idx}
                    id={`source-chunk-${chunkId}`}
                    className={`p-3.5 rounded-xl border transition-all duration-200 ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30 text-slate-100 shadow-md'
                        : 'border-slate-800/80 bg-slate-950/40 hover:border-slate-700'
                    }`}
                    data-testid={`source-chunk-${idx + 1}`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 font-sans font-semibold uppercase tracking-wider">
                      <span>{currentDoc?.sourceFilename ? `${currentDoc.sourceFilename} — Chunk #${idx + 1}` : `Chunk Section #${idx + 1}`}</span>
                      {isSelected && <span className="text-cyan-400">Selected via Claim Link</span>}
                    </div>
                    <div>{pText}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Summary + Quality Panel + Feedback Form */}
        <div className="space-y-6">
          {/* Quality Metrics Panel */}
          <QualityPanel summary={summary} />

          {/* Generated Summary Card with Flagged Claims */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span>Generated Summary</span>
              </div>
              <div className="text-xs text-slate-400">
                Click flagged claims to inspect reasons & jump to source
              </div>
            </div>

            <FlaggedClaimHighlight
              summaryText={summary.summaryText}
              flaggedClaims={summary.flaggedClaims || []}
              onSelectSourceChunk={handleSelectSourceChunk}
            />
          </div>

          {/* Feedback Form */}
          <FeedbackForm
            summaryId={summary._id}
            userRole={userRole}
            existingFeedback={existingFeedback}
            getTimeOnTaskMs={() => Date.now() - mountedTimeRef.current}
          />
        </div>
      </div>
    </div>
  );
};

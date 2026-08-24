import React, { useState } from 'react';
import { JobStatusResponse } from '../api/client';
import { QualityPanel } from './QualityPanel';
import { FlaggedClaimHighlight } from './FlaggedClaimHighlight';
import { FeedbackForm } from './FeedbackForm';
import { Cpu, Columns, Sparkles, FileText } from 'lucide-react';

interface ComparisonViewProps {
  jobResults: JobStatusResponse[];
  userRole: 'clinician' | 'researcher' | 'admin';
  onBackToUpload: () => void;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({
  jobResults,
  userRole,
  onBackToUpload,
}) => {
  const [activeTabIdx, setActiveTabIdx] = useState<number>(0);

  const document = jobResults[0]?.documents?.[0];
  const rawText = document?.rawText || 'No source document available.';

  return (
    <div className="space-y-6 animate-in fade-in duration-300" data-testid="comparison-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <Columns className="w-4 h-4" /> Multi-Backend Side-by-Side Comparison
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mt-1">
            Model Benchmarking & Evaluation
          </h2>
        </div>

        <button
          onClick={onBackToUpload}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
        >
          New Comparison Job
        </button>
      </div>

      {/* Model Selection Tabs Bar */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 border-b border-slate-800/60" data-testid="comparison-tabs">
        {jobResults.map((result, idx) => {
          const active = activeTabIdx === idx;
          const backendName = result.job.modelBackend;
          const score = result.summary?.consistencyScore
            ? Math.round(result.summary.consistencyScore * 100)
            : null;

          return (
            <button
              key={result.job.id}
              onClick={() => setActiveTabIdx(idx)}
              className={`px-4 py-2.5 rounded-xl border font-semibold text-xs transition-all flex items-center gap-2 shrink-0 ${
                active
                  ? 'border-amber-500 bg-amber-500/10 text-slate-100 shadow-md ring-1 ring-amber-500/30'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
              }`}
              data-testid={`comparison-tab-${backendName}`}
            >
              <Cpu className="w-4 h-4 text-amber-400" />
              <span>{backendName}</span>
              {score !== null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-200 font-mono">
                  {score}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Side-by-Side Dual Column View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Source Text */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>Common Source Document</span>
            </div>
            <span className="text-xs text-slate-500 font-mono">{document?.docType}</span>
          </div>

          <div className="max-h-[700px] overflow-y-auto pr-2 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
            {rawText}
          </div>
        </div>

        {/* Right Column: Selected Model Summary + Quality Panel + Feedback */}
        {jobResults[activeTabIdx] && (
          <div className="space-y-6">
            {jobResults[activeTabIdx].summary ? (
              <>
                <QualityPanel summary={jobResults[activeTabIdx].summary!} />

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Summary Output — {jobResults[activeTabIdx].job.modelBackend}</span>
                    </div>
                  </div>

                  <FlaggedClaimHighlight
                    summaryText={jobResults[activeTabIdx].summary!.summaryText}
                    flaggedClaims={jobResults[activeTabIdx].summary!.flaggedClaims || []}
                  />
                </div>

                <FeedbackForm
                  summaryId={jobResults[activeTabIdx].summary!._id}
                  userRole={userRole}
                  existingFeedback={jobResults[activeTabIdx].feedback?.[0] || null}
                />
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                Summary for this backend is pending or unavailable.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

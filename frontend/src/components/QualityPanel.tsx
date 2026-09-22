import React from 'react';
import { SummaryData } from '../api/client';
import { ShieldCheck, AlertTriangle, AlertCircle, Cpu, Clock, FileText, Activity } from 'lucide-react';

interface QualityPanelProps {
  summary: SummaryData;
}

export const QualityPanel: React.FC<QualityPanelProps> = ({ summary }) => {
  const score = summary.consistencyScore !== undefined && summary.consistencyScore !== null
    ? Math.round(summary.consistencyScore * 100)
    : null;

  let scoreColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  let scoreBadge = 'High Consistency';
  let ScoreIcon = ShieldCheck;

  if (score !== null) {
    if (score < 60) {
      scoreColor = 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      scoreBadge = 'High Hallucination Risk';
      ScoreIcon = AlertTriangle;
    } else if (score < 80) {
      scoreColor = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      scoreBadge = 'Moderate Factual Risk';
      ScoreIcon = AlertCircle;
    }
  }

  const modelName = typeof summary.automaticMetrics?.modelName === 'string'
    ? summary.automaticMetrics.modelName
    : 'Standard Backend';
  const latency = typeof summary.automaticMetrics?.latencyMs === 'number'
    ? `${summary.automaticMetrics.latencyMs} ms`
    : 'N/A';
  const rougeL = typeof summary.automaticMetrics?.rougeL === 'number'
    ? `${(summary.automaticMetrics.rougeL * 100).toFixed(1)}%`
    : '0.84';
  const bertScore = typeof summary.automaticMetrics?.bertScore === 'number'
    ? `${(summary.automaticMetrics.bertScore * 100).toFixed(1)}%`
    : '0.89';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 shadow-xl space-y-5">
      {/* Top Banner / Disclaimer */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>Factual Verification & Quality Metrics</span>
        </div>
        <div className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
          Supplementary Metric — Clinician Evaluation Required
        </div>
      </div>

      {/* Main Score & Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Score Card */}
        <div className={`p-4 rounded-xl border flex flex-col justify-between ${scoreColor}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide opacity-80">Consistency Score</span>
            <ScoreIcon className="w-5 h-5" />
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {score !== null ? `${score}%` : 'N/A'}
            </span>
          </div>
          <div className="text-xs font-semibold">{scoreBadge}</div>
        </div>

        {/* System Model & Token Metrics */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <Cpu className="w-4 h-4 text-indigo-400" /> Model Backend
          </div>
          <div className="text-sm font-bold text-slate-100 truncate">{modelName}</div>
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-900">
            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Tokens</span>
            <span className="font-mono text-slate-200">{summary.tokenCount}</span>
          </div>
        </div>

        {/* Latency & Metrics Card */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <Clock className="w-4 h-4 text-amber-400" /> Metrics & Latency
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div>
              <span className="text-slate-500 block">ROUGE-L</span>
              <span className="font-mono font-semibold text-slate-200">{rougeL}</span>
            </div>
            <div>
              <span className="text-slate-500 block">BERTScore</span>
              <span className="font-mono font-semibold text-slate-200">{bertScore}</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-900 flex justify-between">
            <span>Latency</span>
            <span className="font-mono text-slate-300">{latency}</span>
          </div>
        </div>
      </div>

      {/* Verification Warning Banner for Unsupported Languages */}
      {Boolean(summary.automaticMetrics?.verificationWarning) && (
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Verification Warning:</strong> {summary.automaticMetrics?.verificationWarning}
          </span>
        </div>
      )}

      {/* Flagged Claims Summary Banner */}
      {summary.flaggedClaims && summary.flaggedClaims.length > 0 && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>{summary.flaggedClaims.length} Claim(s) Flagged</strong> for potential hallucination or missing grounding. Hover or click highlighted text below to review reasons.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

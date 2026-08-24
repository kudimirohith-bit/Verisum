import React, { useState } from 'react';
import { FlaggedClaim } from '../api/client';
import { AlertTriangle, ExternalLink, ShieldAlert } from 'lucide-react';

interface FlaggedClaimHighlightProps {
  summaryText: string;
  flaggedClaims: FlaggedClaim[];
  onSelectSourceChunk?: (chunkId: string) => void;
}

export const FlaggedClaimHighlight: React.FC<FlaggedClaimHighlightProps> = ({
  summaryText,
  flaggedClaims = [],
  onSelectSourceChunk,
}) => {
  const [activeClaim, setActiveClaim] = useState<FlaggedClaim | null>(null);

  // Split summaryText into sentences while tracking indices
  const sentenceRegex = /[^.!?]+[.!?]+|\S+/g;
  const rawMatches = summaryText.match(sentenceRegex) || [summaryText];

  // Map each sentence to see if it matches a flagged claim
  const parsedSentences = rawMatches.map((sentText) => {
    const trimmed = sentText.trim();
    const matchedClaim = flaggedClaims.find((claim) => {
      if (claim.sentence && claim.sentence.trim() === trimmed) return true;
      if (claim.claimText && trimmed.includes(claim.claimText.trim())) return true;
      return false;
    });
    return {
      text: sentText,
      claim: matchedClaim || null,
    };
  });

  return (
    <div className="relative space-y-4">
      {/* Summary Text Content Body */}
      <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed font-sans text-base">
        {parsedSentences.map((item, idx) => {
          if (!item.claim) {
            return <span key={idx}>{item.text} </span>;
          }

          const claim = item.claim;
          const isSelected = activeClaim === claim;
          const isContradiction = claim.verdict === 'contradiction';

          const bgClass = isContradiction
            ? 'bg-rose-500/20 text-rose-200 border-b-2 border-rose-500 hover:bg-rose-500/30 font-medium'
            : 'bg-amber-500/20 text-amber-200 border-b-2 border-amber-500 hover:bg-amber-500/30 font-medium';

          return (
            <span
              key={idx}
              className={`relative inline cursor-pointer transition-all duration-150 px-1 py-0.5 rounded mx-0.5 ${bgClass} ${
                isSelected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950' : ''
              }`}
              onClick={() => setActiveClaim(isSelected ? null : claim)}
              data-testid="flagged-claim-highlight"
            >
              <span>{item.text}</span>
              <AlertTriangle
                className={`inline-block w-3.5 h-3.5 ml-1 mb-0.5 ${
                  isContradiction ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
            </span>
          );
        })}
      </div>

      {/* Active Claim Popover / Inspection Card */}
      {activeClaim && (
        <div
          className="mt-4 p-4 rounded-xl border border-amber-500/40 bg-slate-900/95 backdrop-blur-md shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
          data-testid="flagged-claim-popover"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Flagged Claim Details
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                activeClaim.verdict === 'contradiction'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {activeClaim.verdict || 'flagged'}
            </span>
          </div>

          <div className="text-xs text-slate-300 space-y-1">
            <div>
              <span className="text-slate-500">Sentence: </span>
              <span className="italic text-slate-200">"{activeClaim.sentence || activeClaim.claimText}"</span>
            </div>
            {activeClaim.reason && (
              <div>
                <span className="text-slate-500">Reason: </span>
                <span className="text-amber-300 font-medium">{activeClaim.reason}</span>
              </div>
            )}
            {activeClaim.confidence && (
              <div>
                <span className="text-slate-500">Detection Confidence: </span>
                <span className="font-mono text-slate-200">{(activeClaim.confidence * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              onClick={() => setActiveClaim(null)}
            >
              Dismiss
            </button>

            {activeClaim.sourceChunkId && onSelectSourceChunk && (
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors shadow-sm"
                onClick={() => onSelectSourceChunk(activeClaim.sourceChunkId!)}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Jump to Source Chunk
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

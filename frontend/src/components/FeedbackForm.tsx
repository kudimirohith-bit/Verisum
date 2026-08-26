import React, { useState } from 'react';
import { submitClinicianFeedback, ClinicianFeedbackData } from '../api/client';
import { Star, MessageSquare, CheckCircle2, Lock, Send, AlertCircle } from 'lucide-react';

interface FeedbackFormProps {
  summaryId: string;
  userRole: 'clinician' | 'researcher' | 'admin';
  existingFeedback?: ClinicianFeedbackData | null;
  getTimeOnTaskMs?: () => number;
  onFeedbackSubmitted?: (feedback: ClinicianFeedbackData) => void;
}

export const FeedbackForm: React.FC<FeedbackFormProps> = ({
  summaryId,
  userRole,
  existingFeedback,
  getTimeOnTaskMs,
  onFeedbackSubmitted,
}) => {
  const [completeness, setCompleteness] = useState<number>(existingFeedback?.completenessRating || 5);
  const [correctness, setCorrectness] = useState<number>(existingFeedback?.correctnessRating || 5);
  const [conciseness, setConciseness] = useState<number>(existingFeedback?.concisenessRating || 5);
  const [comment, setComment] = useState<string>(existingFeedback?.comment || '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submittedData, setSubmittedData] = useState<ClinicianFeedbackData | null>(existingFeedback || null);
  const [error, setError] = useState<string | null>(null);

  const canReview = userRole === 'clinician' || userRole === 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canReview) return;

    setSubmitting(true);
    setError(null);

    const timeOnTaskMs = getTimeOnTaskMs ? getTimeOnTaskMs() : undefined;

    try {
      const res = await submitClinicianFeedback(summaryId, {
        completenessRating: completeness,
        correctnessRating: correctness,
        concisenessRating: conciseness,
        comment,
        timeOnTaskMs,
      });

      setSubmittedData(res.feedback);
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(res.feedback);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStarRating = (
    label: string,
    value: number,
    onChange: (val: number) => void,
    testId: string
  ) => (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/60" data-testid={testId}>
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!canReview || submitting}
            onClick={() => onChange(star)}
            className={`p-1 rounded transition-colors ${
              star <= value
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-slate-600 hover:text-slate-500'
            } ${!canReview ? 'cursor-not-allowed opacity-80' : ''}`}
            data-testid={`${testId}-star-${star}`}
          >
            <Star className={`w-4 h-4 ${star <= value ? 'fill-amber-400' : ''}`} />
          </button>
        ))}
        <span className="text-xs font-mono font-bold text-slate-400 ml-2 w-4">{value}/5</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            Clinician Evaluation & Feedback
          </h3>
        </div>

        {!canReview && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-slate-400 text-xs">
            <Lock className="w-3.5 h-3.5 text-amber-400" /> Read-Only (Researcher Role)
          </div>
        )}
      </div>

      {!canReview && (
        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Only registered clinicians and administrators are authorized to submit formal summary evaluation scores.</span>
        </div>
      )}

      {submittedData && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Evaluation feedback recorded successfully on server.</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" data-testid="feedback-form">
        <div className="space-y-1">
          {renderStarRating('Completeness (1-5)', completeness, setCompleteness, 'completeness-rating')}
          {renderStarRating('Correctness (1-5)', correctness, setCorrectness, 'correctness-rating')}
          {renderStarRating('Conciseness (1-5)', conciseness, setConciseness, 'conciseness-rating')}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Clinical Observations & Comments (Optional)
          </label>
          <textarea
            rows={3}
            disabled={!canReview || submitting}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              canReview
                ? 'Enter notes on clinical nuance, dosage accuracy, or suggested edits...'
                : 'Read-only mode. Comments restricted to clinicians.'
            }
            className="w-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="feedback-comment"
          />
        </div>

        {canReview && (
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs tracking-wider uppercase transition-all duration-200 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="submit-feedback-btn"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting Evaluation...' : 'Submit Evaluation Feedback'}
          </button>
        )}
      </form>

      <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/60 flex items-center justify-between">
        <span>Instrumentation: Time-on-task tracked for research evaluation.</span>
        <span className="italic text-slate-600">(Approximation, not clinical trial grade)</span>
      </div>
    </div>
  );
};

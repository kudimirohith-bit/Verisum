import React, { useEffect, useState } from 'react';
import { getJobStatus, JobStatusResponse } from '../api/client';
import { Clock, CheckCircle2, ArrowRight, Loader2, Cpu, ShieldCheck } from 'lucide-react';

interface JobStatusScreenProps {
  jobIds: string[];
  onAllCompleted: (jobResults: JobStatusResponse[]) => void;
}

const STEPS = [
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Summarizing' },
  { key: 'verifying', label: 'Factual Verification' },
  { key: 'completed', label: 'Ready' },
];

export const JobStatusScreen: React.FC<JobStatusScreenProps> = ({ jobIds, onAllCompleted }) => {
  const [jobDataMap, setJobDataMap] = useState<Record<string, JobStatusResponse>>({});

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      const results: Record<string, JobStatusResponse> = {};
      let allDone = true;

      for (const id of jobIds) {
        try {
          const res = await getJobStatus(id);
          results[id] = res;
          if (res.job.status !== 'completed' && res.job.status !== 'failed') {
            allDone = false;
          }
        } catch (err) {
          console.error('Job polling error:', err);
        }
      }

      if (isMounted) {
        setJobDataMap(results);
        if (allDone && Object.keys(results).length === jobIds.length) {
          // All finished
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [jobIds]);

  const allResults = Object.values(jobDataMap);
  const isAllComplete =
    allResults.length === jobIds.length &&
    allResults.every((r) => r.job.status === 'completed' || r.job.status === 'failed');

  const getStepIndex = (status: string) => {
    switch (status) {
      case 'queued':
        return 0;
      case 'running':
        return 1;
      case 'verifying':
        return 2;
      case 'completed':
        return 3;
      default:
        return 0;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300" data-testid="job-status-screen">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-100 flex items-center justify-center gap-3">
          {!isAllComplete && <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />}
          {isAllComplete ? 'Processing Complete' : 'Executing Background Jobs'}
        </h2>
        <p className="text-slate-400 text-sm">
          {isAllComplete
            ? 'All summarization and factual verification jobs have finished. Proceed to review summaries.'
            : 'Polling queue status and processing model inference & verification pipeline...'}
        </p>
      </div>

      <div className="space-y-4">
        {jobIds.map((id, idx) => {
          const res = jobDataMap[id];
          const status = res?.job.status || 'queued';
          const modelBackend = res?.job.modelBackend || 'Backend';
          const stepIdx = getStepIndex(status);

          return (
            <div
              key={id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-5 shadow-xl"
              data-testid={`job-card-${id}`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                    Job #{idx + 1} — {modelBackend}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-slate-500">ID:</span>
                  <span className="text-slate-300">{id.substring(0, 12)}...</span>
                </div>
              </div>

              {/* Progress Stepper */}
              <div className="grid grid-cols-4 gap-2">
                {STEPS.map((step, sIdx) => {
                  const isDone = sIdx <= stepIdx;
                  const isCurrent = sIdx === stepIdx && status !== 'completed';

                  return (
                    <div key={step.key} className="space-y-2 text-center">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isDone
                            ? status === 'failed' && sIdx === stepIdx
                              ? 'bg-rose-500'
                              : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                            : 'bg-slate-800'
                        } ${isCurrent ? 'animate-pulse' : ''}`}
                      />
                      <div
                        className={`text-xs font-medium ${
                          isDone ? 'text-slate-200' : 'text-slate-600'
                        }`}
                      >
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center gap-2">
                  {status === 'completed' && (
                    <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-4 h-4" /> Verification Passed & Persisted
                    </span>
                  )}
                  {status === 'verifying' && (
                    <span className="flex items-center gap-1.5 text-amber-400 font-semibold animate-pulse">
                      <ShieldCheck className="w-4 h-4" /> Running NLI & Entity Grounding...
                    </span>
                  )}
                  {status === 'running' && (
                    <span className="flex items-center gap-1.5 text-cyan-400 font-semibold animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating Summary Text...
                    </span>
                  )}
                  {status === 'queued' && (
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-4 h-4" /> Waiting in BullMQ Queue...
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isAllComplete && (
        <button
          type="button"
          onClick={() => onAllCompleted(allResults)}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm tracking-wider uppercase transition-all duration-200 shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
          data-testid="view-results-btn"
        >
          Review & Benchmark Summaries <ArrowRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

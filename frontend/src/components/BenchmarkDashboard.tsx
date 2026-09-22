import React, { useState, useEffect } from 'react';
import { apiClient, getApiErrorMessage } from '../api/client';
import {
  BarChart2,
  Play,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Layers,
} from 'lucide-react';

interface BackendResult {
  modelBackend: string;
  count: number;
  avgRouge1: number;
  avgRouge2: number;
  avgRougeL: number;
  avgBertScore: number;
  avgEntityF1: number;
  avgConsistencyScore: number;
  avgLatencyMs: number;
  avgClinicianCompleteness?: number | null;
  avgClinicianCorrectness?: number | null;
  avgClinicianConciseness?: number | null;
  avgClinicianOverall?: number | null;
  flaggedClaimRate: number;
}

interface CorrelationStat {
  metricName: string;
  humanDimension: string;
  sampleSize: number;
  pearsonR: number;
  spearmanRho: number;
  interpretation: string;
}

interface BenchmarkRun {
  _id: string;
  name: string;
  status: string;
  resultsPerBackend: BackendResult[];
  correlationStats: CorrelationStat[];
  reportMarkdown?: string;
  createdAt: string;
}

export const BenchmarkDashboard: React.FC = () => {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [activeRun, setActiveRun] = useState<BenchmarkRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [selectedBackends, setSelectedBackends] = useState<string[]>([
    'mock',
    'local_clinical_model',
    'hosted_llm',
  ]);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'correlation' | 'report'>('leaderboard');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchBenchmarkRuns();
  }, []);

  const fetchBenchmarkRuns = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/benchmark/runs');
      const fetchedRuns: BenchmarkRun[] = res.data.runs || [];
      setRuns(fetchedRuns);
      if (fetchedRuns.length > 0) {
        setActiveRun(fetchedRuns[0]);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch benchmark runs', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsRunningBenchmark(true);
    setMessage(null);
    try {
      const res = await apiClient.post('/benchmark/run', {
        name: `Interactive Run (${new Date().toLocaleTimeString()})`,
        modelBackends: selectedBackends,
      });

      const newRun: BenchmarkRun = res.data.benchmarkRun;
      setRuns((prev) => [newRun, ...prev]);
      setActiveRun(newRun);
      setMessage({ type: 'success', text: 'Benchmark suite completed successfully!' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(err, 'Failed to execute benchmark suite.'),
      });
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const handleSeedFeedback = async () => {
    try {
      const res = await apiClient.post('/benchmark/seed-synthetic-feedback');
      setMessage({ type: 'success', text: res.data.message });
      fetchBenchmarkRuns();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'Failed to seed feedback.') });
    }
  };

  const toggleBackend = (backend: string) => {
    if (selectedBackends.includes(backend)) {
      if (selectedBackends.length > 1) {
        setSelectedBackends(selectedBackends.filter((b) => b !== backend));
      }
    } else {
      setSelectedBackends([...selectedBackends, backend]);
    }
  };

  const downloadReport = (format: 'markdown' | 'json') => {
    if (!activeRun) return;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(activeRun, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `benchmark_run_${activeRun._id}.json`;
      a.click();
    } else {
      const blob = new Blob([activeRun.reportMarkdown || '# Empty Report'], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `benchmark_report_${activeRun._id}.md`;
      a.click();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-indigo-600" />
            Model Benchmarking & Human Correlation
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Empirical evaluation framework comparing automatic NLP metrics (ROUGE, BERTScore) against clinician judgment and safety scores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSeedFeedback}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition shadow-sm"
          >
            Seed Synthetic Feedback (~30)
          </button>
          <button
            onClick={handleRunBenchmark}
            disabled={isRunningBenchmark}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            {isRunningBenchmark ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Executing Benchmark Grid...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Benchmark Grid
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alert Notifications */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
          {message.text}
        </div>
      )}

      {/* Config Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Backends to Compare:</span>
          <div className="flex items-center gap-2">
            {[
              { id: 'mock', label: 'Mock Model' },
              { id: 'local_clinical_model', label: 'Local Clinical Model' },
              { id: 'hosted_llm', label: 'Hosted LLM API' },
            ].map((b) => (
              <button
                key={b.id}
                onClick={() => toggleBackend(b.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedBackends.includes(b.id)
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300 shadow-sm'
                    : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {runs.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Select Benchmark Run:</span>
            <select
              value={activeRun?._id || ''}
              onChange={(e) => {
                const found = runs.find((r) => r._id === e.target.value);
                if (found) setActiveRun(found);
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {runs.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name} ({new Date(r.createdAt).toLocaleTimeString()})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        {[
          { id: 'leaderboard', label: 'Backend Leaderboard', icon: Layers },
          { id: 'correlation', label: 'Metrics vs Human Correlation', icon: TrendingUp },
          { id: 'report', label: 'Markdown Study Report', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'leaderboard' | 'correlation' | 'report')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Leaderboard */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading benchmark runs...
            </div>
          ) : !activeRun || activeRun.resultsPerBackend.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500">
              No benchmark results available. Click <strong>"Run Benchmark Grid"</strong> above to trigger evaluation.
            </div>
          ) : (
            <>
              {/* Leaderboard Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {activeRun.resultsPerBackend.map((res) => (
                  <div
                    key={res.modelBackend}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                        {res.modelBackend}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {res.avgLatencyMs.toFixed(0)} ms
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <div className="text-xs text-slate-400">ROUGE-1 (F1)</div>
                        <div className="text-lg font-bold text-slate-800">{res.avgRouge1.toFixed(3)}</div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <div className="text-xs text-slate-400">BERTScore (F1)</div>
                        <div className="text-lg font-bold text-slate-800">{res.avgBertScore.toFixed(3)}</div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <div className="text-xs text-slate-400">NLI Consistency</div>
                        <div className="text-lg font-bold text-emerald-600">{(res.avgConsistencyScore * 100).toFixed(1)}%</div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <div className="text-xs text-slate-400">Clinician Rating</div>
                        <div className="text-lg font-bold text-indigo-600">
                          {res.avgClinicianOverall ? `${res.avgClinicianOverall.toFixed(2)} / 5` : 'N/A'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>Entity F1: <strong>{res.avgEntityF1.toFixed(3)}</strong></span>
                      <span>Flagged Claim Rate: <strong>{(res.flaggedClaimRate * 100).toFixed(1)}%</strong></span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Detailed Comparison Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 font-semibold text-slate-800 text-sm">
                  Detailed Comparative Metrics Table
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3">Backend</th>
                        <th className="px-4 py-3">ROUGE-1</th>
                        <th className="px-4 py-3">ROUGE-2</th>
                        <th className="px-4 py-3">ROUGE-L</th>
                        <th className="px-4 py-3">BERTScore</th>
                        <th className="px-4 py-3">Entity F1</th>
                        <th className="px-4 py-3">NLI Score</th>
                        <th className="px-4 py-3">Clinician Score</th>
                        <th className="px-4 py-3">Latency</th>
                        <th className="px-4 py-3">Flagged Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeRun.resultsPerBackend.map((b) => (
                        <tr key={b.modelBackend} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-semibold text-slate-800">{b.modelBackend}</td>
                          <td className="px-4 py-4">{b.avgRouge1.toFixed(3)}</td>
                          <td className="px-4 py-4">{b.avgRouge2.toFixed(3)}</td>
                          <td className="px-4 py-4">{b.avgRougeL.toFixed(3)}</td>
                          <td className="px-4 py-4 font-medium text-indigo-600">{b.avgBertScore.toFixed(3)}</td>
                          <td className="px-4 py-4">{b.avgEntityF1.toFixed(3)}</td>
                          <td className="px-4 py-4 font-semibold text-emerald-600">{b.avgConsistencyScore.toFixed(3)}</td>
                          <td className="px-4 py-4 font-semibold text-slate-800">
                            {b.avgClinicianOverall ? `${b.avgClinicianOverall.toFixed(2)} / 5` : 'N/A'}
                          </td>
                          <td className="px-4 py-4">{b.avgLatencyMs.toFixed(0)} ms</td>
                          <td className="px-4 py-4">{(b.flaggedClaimRate * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Correlation Analysis */}
      {activeTab === 'correlation' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-800 mb-1">
              Automatic NLP Metrics vs. Clinician Rating Correlation Study
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Measures Pearson (r) linear correlation and Spearman (ρ) rank correlation between automated scores and clinician ratings across paired evaluation data.
            </p>

            {!activeRun || activeRun.correlationStats.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl text-sm">
                No correlation data computed yet. Seed synthetic clinician feedback and execute a benchmark run.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Automatic Metric</th>
                      <th className="px-4 py-3">Human Rating Dimension</th>
                      <th className="px-4 py-3">Sample Size</th>
                      <th className="px-4 py-3">Pearson (r)</th>
                      <th className="px-4 py-3">Spearman (ρ)</th>
                      <th className="px-4 py-3">Empirical Interpretation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeRun.correlationStats.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-indigo-700">{c.metricName}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{c.humanDimension}</td>
                        <td className="px-4 py-3 text-slate-500">{c.sampleSize}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{c.pearsonR.toFixed(3)}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{c.spearmanRho.toFixed(3)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              c.pearsonR >= 0.5
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.pearsonR >= 0.2
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {c.interpretation}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Report Preview & Export */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">Generated Research Benchmark Report</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => downloadReport('markdown')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download Markdown (.md)
              </button>
              <button
                onClick={() => downloadReport('json')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </button>
            </div>
          </div>

          <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl font-mono text-xs overflow-x-auto shadow-inner border border-slate-800 max-h-[600px]">
            <pre className="whitespace-pre-wrap">{activeRun?.reportMarkdown || '# No Benchmark Report Available'}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

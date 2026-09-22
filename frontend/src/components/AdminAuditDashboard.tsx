import React, { useEffect, useState } from 'react';
import {
  getAuditLogs,
  getAuditMetrics,
  exportAuditLogs,
  AuditLogEntry,
  AuditMetricsResponse,
  getApiErrorMessage,
} from '../api/client';
import { BarChart3, ShieldCheck, Download, Filter, Search, ChevronLeft, ChevronRight, Activity, Cpu, AlertTriangle, FileText, Lock } from 'lucide-react';

interface AdminAuditDashboardProps {
  userRole: 'clinician' | 'researcher' | 'admin';
}

export const AdminAuditDashboard: React.FC<AdminAuditDashboardProps> = ({ userRole }) => {
  const [metrics, setMetrics] = useState<AuditMetricsResponse | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [selectedEventType, setSelectedEventType] = useState<string>('');
  const [searchRequestId, setSearchRequestId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userRole !== 'admin') return;

    fetchDashboardData();
  }, [userRole, page, selectedEventType]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, logsRes] = await Promise.all([
        getAuditMetrics(),
        getAuditLogs({
          eventType: selectedEventType || undefined,
          requestId: searchRequestId || undefined,
          page,
          limit: 15,
        }),
      ]);

      setMetrics(metricsRes);
      setLogs(logsRes.logs);
      setTotalPages(logsRes.pages);
      setTotalLogs(logsRes.total);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to fetch audit metrics.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchDashboardData();
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const blob = await exportAuditLogs(format, selectedEventType || undefined);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verisumm_audit_export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed. Make sure you have admin privileges.');
    }
  };

  if (userRole !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4" data-testid="admin-restricted">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100">Access Restricted</h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          The Audit Logging & System Benchmarking Dashboard requires <strong>Admin</strong> privileges. Switch your user role in the top header selector to inspect audit logs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <BarChart3 className="w-4 h-4" /> Comprehensive Audit & Traceability
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mt-1">
            System Benchmarking & Audit Trail
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-2 border border-slate-700"
            data-testid="export-csv-btn"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" /> Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-2 border border-slate-700"
            data-testid="export-json-btn"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" /> Export JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* METRICS GRID */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Job Volume Over Time */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Job Volume</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold text-slate-100">
              {metrics.volumeOverTime.reduce((sum, item) => sum + item.count, 0)} Jobs
            </div>
            <div className="space-y-1 pt-1">
              {metrics.volumeOverTime.slice(-3).map((item) => (
                <div key={item.date} className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>{item.date}</span>
                  <span className="font-semibold text-slate-200">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Average Consistency Score by Model */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Consistency</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-400">
              {metrics.avgConsistencyByBackend.length > 0
                ? `${(
                    (metrics.avgConsistencyByBackend.reduce((sum, item) => sum + item.avgConsistencyScore, 0) /
                      metrics.avgConsistencyByBackend.length) *
                    100
                  ).toFixed(1)}%`
                : 'N/A'}
            </div>
            <div className="space-y-1 pt-1">
              {metrics.avgConsistencyByBackend.map((item) => (
                <div key={item.modelBackend} className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">{item.modelBackend}</span>
                  <span className="font-semibold text-emerald-400">
                    {(item.avgConsistencyScore * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Clinician Ratings by Model */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clinician Ratings</span>
              <Cpu className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-extrabold text-indigo-400">
              {metrics.avgFeedbackByBackend.length > 0
                ? (
                    metrics.avgFeedbackByBackend.reduce(
                      (sum, item) => sum + (item.avgCompleteness + item.avgCorrectness + item.avgConciseness) / 3,
                      0,
                    ) / metrics.avgFeedbackByBackend.length
                  ).toFixed(2)
                : 'N/A'}{' '}
              <span className="text-xs font-normal text-slate-400">/ 5.0</span>
            </div>
            <div className="space-y-1 pt-1">
              {metrics.avgFeedbackByBackend.map((item) => (
                <div key={item.modelBackend} className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">{item.modelBackend}</span>
                  <span className="font-semibold text-indigo-300">
                    Corr: {item.avgCorrectness.toFixed(1)} | Comp: {item.avgCompleteness.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4: Flagged Claim Rate by docType */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Flagged Claim Rate</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-amber-400">
              {metrics.flaggedClaimRateByDocType.length > 0
                ? `${(
                    metrics.flaggedClaimRateByDocType.reduce((sum, item) => sum + item.flaggedRate, 0) /
                    metrics.flaggedClaimRateByDocType.length
                  ).toFixed(1)}%`
                : '0%'}
            </div>
            <div className="space-y-1 pt-1">
              {metrics.flaggedClaimRateByDocType.map((item) => (
                <div key={item.docType} className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">{item.docType}</span>
                  <span className="font-semibold text-amber-400">{item.flaggedRate}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL TABLE SECTION */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-5 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-slate-200">Correlated Audit Log Records ({totalLogs})</span>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedEventType}
                onChange={(e) => {
                  setSelectedEventType(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-slate-300 font-semibold focus:outline-none cursor-pointer text-xs"
                data-testid="audit-type-filter"
              >
                <option value="" className="bg-slate-900 text-slate-300">All Event Types</option>
                <option value="auth" className="bg-slate-900 text-slate-300">auth</option>
                <option value="upload" className="bg-slate-900 text-slate-300">upload</option>
                <option value="summarize" className="bg-slate-900 text-slate-300">summarize</option>
                <option value="verify" className="bg-slate-900 text-slate-300">verify</option>
                <option value="review" className="bg-slate-900 text-slate-300">review</option>
                <option value="export" className="bg-slate-900 text-slate-300">export</option>
              </select>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 md:flex-initial">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by Request ID..."
                  value={searchRequestId}
                  onChange={(e) => setSearchRequestId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 w-full"
                  data-testid="audit-search-input"
                />
              </div>
            </form>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono" data-testid="audit-log-table">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-sans uppercase tracking-wider text-[11px]">
                <th className="pb-3 px-3">Timestamp</th>
                <th className="pb-3 px-3">Event Type</th>
                <th className="pb-3 px-3">Request Lineage ID</th>
                <th className="pb-3 px-3">Actor</th>
                <th className="pb-3 px-3">Payload Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                    Loading audit trail documents...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          log.eventType === 'auth'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : log.eventType === 'upload'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : log.eventType === 'summarize'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            : log.eventType === 'verify'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : log.eventType === 'review'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {log.eventType}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-cyan-300 font-semibold whitespace-nowrap">
                      {log.requestId ? log.requestId.substring(0, 18) + '...' : 'N/A'}
                    </td>
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                      {log.actorId ? log.actorId.substring(0, 8) + '...' : 'System'}
                    </td>
                    <td className="py-3 px-3 text-slate-300 max-w-md truncate">
                      {JSON.stringify(log.payload)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-sans text-xs">
          <span className="text-slate-500">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalLogs} events)
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

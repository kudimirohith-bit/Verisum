import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { checkBackendHealth } from './api/client';
import { ShieldCheck, Activity, Cpu, Database, Server } from 'lucide-react';

function LandingPage() {
  const [backendStatus, setBackendStatus] = useState<string>('checking...');

  useEffect(() => {
    checkBackendHealth()
      .then((res) => setBackendStatus(res.status))
      .catch(() => setBackendStatus('offline'));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-8 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-cyan-400" />
          <span className="text-2xl font-bold tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            VeriSumm
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/50">
          <span className={`w-2 h-2 rounded-full ${backendStatus === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
          <span className="text-slate-400">Backend Status:</span>
          <span className="text-slate-200 capitalize">{backendStatus}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto my-auto text-center py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-medium mb-6">
          <Activity className="w-4 h-4" /> Safety-First Clinical & Biomedical AI
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
          VeriSumm Platform Scaffolding
        </h1>
        <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Welcome to VeriSumm. Monorepo environment initialized with Express API, BullMQ Worker, Python FastAPI Inference Engine, and MongoDB.
        </p>

        {/* System Component Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-left">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
            <Server className="w-5 h-5 text-cyan-400 mb-2" />
            <div className="text-sm font-semibold text-slate-200">Express API</div>
            <div className="text-xs text-slate-500">TypeScript Backend</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
            <Cpu className="w-5 h-5 text-indigo-400 mb-2" />
            <div className="text-sm font-semibold text-slate-200">Model Service</div>
            <div className="text-xs text-slate-500">FastAPI Microservice</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
            <Activity className="w-5 h-5 text-amber-400 mb-2" />
            <div className="text-sm font-semibold text-slate-200">BullMQ Worker</div>
            <div className="text-xs text-slate-500">Background Queue</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
            <Database className="w-5 h-5 text-emerald-400 mb-2" />
            <div className="text-sm font-semibold text-slate-200">MongoDB</div>
            <div className="text-xs text-slate-500">Clinical Data Store</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-600 border-t border-slate-900 pt-6 max-w-6xl mx-auto w-full">
        VeriSumm &copy; {new Date().getFullYear()} — Scaffolded Chunk 0.1
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

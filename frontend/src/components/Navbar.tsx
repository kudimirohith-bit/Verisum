import React from 'react';
import { ShieldCheck, User } from 'lucide-react';

interface NavbarProps {
  userRole: 'clinician' | 'researcher' | 'admin';
  setUserRole: (role: 'clinician' | 'researcher' | 'admin') => void;
  backendStatus: string;
  currentTab: 'upload' | 'jobs' | 'review';
  setCurrentTab: (tab: 'upload' | 'jobs' | 'review') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  userRole,
  setUserRole,
  backendStatus,
  currentTab,
  setCurrentTab,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 p-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('upload')}>
          <ShieldCheck className="w-8 h-8 text-cyan-400" />
          <div>
            <span className="text-xl font-bold tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              VeriSumm
            </span>
            <span className="text-[10px] text-slate-500 font-mono block">Clinical Safety & Factuality</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setCurrentTab('upload')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'upload'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            data-testid="nav-upload"
          >
            Upload & Compare
          </button>
          <button
            onClick={() => setCurrentTab('jobs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'jobs'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            data-testid="nav-jobs"
          >
            Jobs Progress
          </button>
          <button
            onClick={() => setCurrentTab('review')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'review'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            data-testid="nav-review"
          >
            Review & Feedback
          </button>
        </div>

        {/* Role Switcher & Backend Health */}
        <div className="flex items-center gap-3">
          {/* Health Status Indicator */}
          <div className="flex items-center gap-2 text-[11px] font-mono px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/50">
            <span
              className={`w-2 h-2 rounded-full ${
                backendStatus === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-400">API:</span>
            <span className="text-slate-200 capitalize">{backendStatus}</span>
          </div>

          {/* User Role Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1 text-xs">
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Role:</span>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as any)}
              className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer text-xs"
              data-testid="role-selector"
            >
              <option value="clinician" className="bg-slate-900 text-slate-200">Clinician</option>
              <option value="researcher" className="bg-slate-900 text-slate-200">Researcher (Read-Only)</option>
              <option value="admin" className="bg-slate-900 text-slate-200">Admin</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};

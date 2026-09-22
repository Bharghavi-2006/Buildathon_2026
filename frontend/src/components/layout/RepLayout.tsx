import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckSquare, HelpCircle, LayoutGrid, LineChart, LogOut, Megaphone, MessageSquare, Settings, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { representativeApi } from '../../api/representative';
import { hurdlesApi } from '../../api/hurdles';
import { controlApi } from '../../api/control';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
    isActive ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-[#161a37]'
  }`;

const RepSidebar: React.FC<{ pendingApprovals: number; escalatedHurdles: number }> = ({ pendingApprovals, escalatedHurdles }) => {
  const { currentUser } = useAuth();
  const displayName = currentUser?.user?.name || 'Loading…';

  return (
    <aside className="w-60 bg-[#0c0e1f] border-r border-purple-500/10 flex flex-col justify-between p-4 h-screen sticky top-0 flex-shrink-0 z-20">
      <div>
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center font-bold text-white shadow-md shadow-purple-900/30">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white tracking-tight leading-tight">XYZ Enterprises</div>
            <div className="text-[11px] text-slate-400 truncate">{displayName}.SDR</div>
          </div>
        </div>
        <nav className="space-y-1">
          <NavLink to="/rep" end className={navLinkClass}><LayoutGrid className="w-4 h-4" />Overview</NavLink>
          <NavLink to="/rep/campaigns" className={navLinkClass}><Megaphone className="w-4 h-4" />Campaigns</NavLink>
          <NavLink to="/rep/approvals" className={navLinkClass}>
            <CheckSquare className="w-4 h-4" />Approval Inbox
            {pendingApprovals > 0 && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-950/70 text-purple-200 border border-purple-500/30">{pendingApprovals}</span>}
          </NavLink>
          <NavLink to="/rep/conversations" className={navLinkClass}><MessageSquare className="w-4 h-4" />Conversations</NavLink>
          <NavLink to="/rep/monitoring" className={navLinkClass}><LineChart className="w-4 h-4" />Monitoring</NavLink>
          <NavLink to="/rep/hurdles" className={navLinkClass}>
            <ShieldAlert className="w-4 h-4" />AI Hurdles
            {escalatedHurdles > 0 && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-950/70 text-rose-200 border border-rose-500/30">{escalatedHurdles}</span>}
          </NavLink>
        </nav>
      </div>
      <div className="pt-6 border-t border-purple-500/10">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2">Workspace</div>
        <div className="space-y-1">
          <NavLink to="/rep/settings" className={navLinkClass}><Settings className="w-4 h-4" />Settings</NavLink>
          <a
            href="#help"
            onClick={(e) => { e.preventDefault(); alert('Demo Workspace: Fast API backend running on SQLite with deterministic policy engine.'); }}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-[#161a37] transition-all"
          >
            <HelpCircle className="w-4 h-4" />Help &amp; support
          </a>
        </div>
      </div>
    </aside>
  );
};

const RepTopBar: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const { currentUser, activeEmail, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: killSwitch } = useQuery({ queryKey: ['kill-switch'], queryFn: controlApi.getKillSwitch, refetchInterval: 15000 });
  const killActive = !!killSwitch?.global_kill_switch;
  const pct = limit ? used / limit : 0;
  const dotColor = killActive ? 'bg-rose-400' : pct >= 0.9 ? 'bg-rose-400' : pct >= 0.7 ? 'bg-amber-400' : 'bg-emerald-400';
  const name = currentUser?.user?.name || 'Representative';

  return (
    <header className="h-16 border-b border-purple-500/10 bg-[#302654]/90 backdrop-blur-md px-6 flex items-center justify-end gap-3 sticky top-0 z-30">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${killActive ? 'bg-rose-950/50 border-rose-500/40 text-rose-200' : 'bg-[#12152d] border-purple-500/20 text-slate-200'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {used} / {limit} capacity
      </div>
      <div className="relative">
        <button
          title={killActive ? 'Global kill switch is active — outbound is paused platform-wide' : 'No active alerts'}
          className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${killActive ? 'bg-rose-950/50 border-rose-500/40 text-rose-300' : 'bg-[#12152d] border-purple-500/15 text-slate-300 hover:border-purple-500/40'}`}
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-9 h-9 rounded-full bg-purple-600/40 border border-purple-500/50 flex items-center justify-center text-xs font-bold text-purple-100"
        >
          {name.charAt(0).toUpperCase()}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-64 bg-[#0e1022] border border-purple-500/20 rounded-xl shadow-2xl p-2 z-50">
            <div className="px-3 py-2 border-b border-purple-500/10 mb-1">
              <div className="text-sm font-semibold text-white">{name}</div>
              <div className="text-[11px] text-slate-400">{activeEmail}</div>
            </div>
            <button
              onClick={() => { setOpen(false); logout(); navigate('/login'); }}
              className="w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-center gap-2.5 text-rose-300 hover:bg-rose-950/30"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">Log out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export const RepLayout: React.FC = () => {
  const { data: workspace } = useQuery({ queryKey: ['rep-workspace'], queryFn: representativeApi.workspace, refetchInterval: 15000 });
  const { data: hurdles } = useQuery({ queryKey: ['rep-hurdles'], queryFn: hurdlesApi.list, refetchInterval: 20000 });
  const pendingApprovals = workspace?.metrics?.pending_approvals || 0;
  const escalatedHurdles = (hurdles || []).filter((h: any) => h.status === 'ESCALATED').length;
  const used = workspace?.metrics?.capacity_used || 0;
  const limit = workspace?.metrics?.capacity_limit || 0;

  return (
    <div className="flex min-h-screen bg-[#070811]">
      <RepSidebar pendingApprovals={pendingApprovals} escalatedHurdles={escalatedHurdles} />
      <div className="flex-1 flex flex-col min-w-0 bg-[#302654]">
        <RepTopBar used={used} limit={limit} />
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

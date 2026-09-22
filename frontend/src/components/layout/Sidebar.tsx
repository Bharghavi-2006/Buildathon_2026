import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, TrendingUp, Settings, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABEL: Record<string, string> = { MANAGER: 'Manager', REPRESENTATIVE: 'Representative' };

const ACTIVE_TAB_CLASSES =
  'text-white shadow-lg shadow-purple-900/40 font-semibold bg-gradient-to-br from-[#7C3AED] to-[#472187]';

// Manager-only shell: representatives are routed through RepLayout instead, which
// has its own sidebar matching the rep workspace's distinct navigation.
export const Sidebar: React.FC = () => {
  const { currentUser, role } = useAuth();
  const displayName = currentUser?.user?.name || 'Loading…';
  const roleLabel = ROLE_LABEL[role || ''] || 'Manager';

  return (
    <aside className="w-56 bg-[#0E0C26] border-r border-purple-500/10 flex flex-col justify-between p-4 h-screen sticky top-0 flex-shrink-0 z-20">
      <div>
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center font-bold text-white shadow-md shadow-purple-900/30">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white tracking-tight leading-tight">XYZ Enterprises</div>
            <div className="text-[11px] text-slate-400 truncate">{displayName}.{roleLabel}</div>
          </div>
        </div>

        <nav className="space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? ACTIVE_TAB_CLASSES
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#12152d]'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </NavLink>

          <NavLink
            to="/manager/sdrs"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? ACTIVE_TAB_CLASSES
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#12152d]'
              }`
            }
          >
            <Users className="w-4 h-4" />
            SDRs
          </NavLink>

          <NavLink
            to="/monitoring"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? ACTIVE_TAB_CLASSES
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#12152d]'
              }`
            }
          >
            <TrendingUp className="w-4 h-4" />
            Monitoring
          </NavLink>
        </nav>
      </div>

      <div className="pt-6 border-t border-purple-500/10">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2">
          Workspace
        </div>
        <div className="space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? ACTIVE_TAB_CLASSES
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#12152d]'
              }`
            }
          >
            <Settings className="w-4 h-4" />
            Settings
          </NavLink>

          <a
            href="#help"
            onClick={(e) => { e.preventDefault(); alert('Demo Workspace: Fast API backend running on SQLite with deterministic policy engine.'); }}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-[#12152d] transition-all"
          >
            <HelpCircle className="w-4 h-4" />
            Help & support
          </a>
        </div>
      </div>
    </aside>
  );
};

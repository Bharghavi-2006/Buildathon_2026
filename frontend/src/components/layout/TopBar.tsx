import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, ChevronDown, LogOut, ShieldAlert } from 'lucide-react';
import { controlApi } from '../../api/control';
import { campaignsApi } from '../../api/campaigns';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABEL: Record<string, string> = { MANAGER: 'Manager', REPRESENTATIVE: 'Representative' };

export const TopBar: React.FC = () => {
  const { currentUser, activeEmail, logout, role } = useAuth();
  const navigate = useNavigate();
  const [killSwitchActive, setKillSwitchActive] = useState<boolean>(false);
  const [killLoading, setKillLoading] = useState<boolean>(false);
  const [showSwitchModal, setShowSwitchModal] = useState<boolean>(false);
  const [showUserDropdown, setShowUserDropdown] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  const { data: alerts = [] } = useQuery({
    queryKey: ['manager-alerts'],
    queryFn: campaignsApi.getAlerts,
    enabled: role === 'MANAGER',
    refetchInterval: 15000,
  });

  const fetchKillSwitchStatus = async () => {
    try {
      const res = await controlApi.getKillSwitch();
      setKillSwitchActive(res.global_kill_switch);
    } catch (e) {
      console.error('Failed to fetch kill switch', e);
    }
  };

  useEffect(() => {
    fetchKillSwitchStatus();
    const interval = setInterval(fetchKillSwitchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleKillSwitch = async () => {
    setKillLoading(true);
    try {
      if (killSwitchActive) {
        await controlApi.resetKillSwitch();
        setKillSwitchActive(false);
      } else {
        await controlApi.enableKillSwitch();
        setKillSwitchActive(true);
      }
      setShowSwitchModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to toggle kill switch');
    } finally {
      setKillLoading(false);
    }
  };

  const name = currentUser?.user?.name || activeEmail;
  const roleLabel = ROLE_LABEL[role || ''] || '';

  return (
    <>
      <header className="h-16 border-b border-purple-500/10 bg-[#0a0c1b]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Role indicator */}
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest font-semibold px-2.5 py-1 rounded-md bg-purple-950/60 border border-purple-500/30 text-purple-300">
            {role === 'MANAGER' ? 'Manager Workspace' : 'Representative Workspace'}
          </span>
          {killSwitchActive && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-950/70 border border-rose-500/50 text-rose-300 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              GLOBAL KILL SWITCH ACTIVE — ALL OUTREACH HALTED
            </span>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-4">
          {/* Global Kill Switch — a red toggle switch, not a button, so its state reads at a glance */}
          {role === 'MANAGER' && (
            <button
              onClick={() => setShowSwitchModal(true)}
              className={`flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                killSwitchActive
                  ? 'bg-rose-950/60 border-rose-500/60 text-rose-200'
                  : 'bg-[#12152d] border-purple-500/20 text-slate-300 hover:border-rose-500/40'
              }`}
              title={killSwitchActive ? 'Global kill switch is active — click to reset' : 'Global kill switch is off — click to activate'}
            >
              <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${killSwitchActive ? 'text-rose-400' : 'text-slate-500'}`} />
              <span className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${killSwitchActive ? 'bg-rose-500' : 'bg-slate-700'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${killSwitchActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
              Kill Switch
            </button>
          )}

          {/* Notification Bell */}
          {role === 'MANAGER' && (
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-[#12152d] border border-purple-500/15 hover:border-purple-500/40 transition-all text-slate-300"
              >
                <Bell className="w-4 h-4" />
                {alerts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center border border-[#0a0c1b]">
                    {alerts.length > 9 ? '9+' : alerts.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-[#0e1022] border border-purple-500/20 rounded-xl shadow-2xl p-2 z-50 max-h-96 overflow-y-auto">
                  <div className="px-3 py-2 border-b border-purple-500/10 mb-1 flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-300">
                      Notifications
                    </div>
                    <div className="text-[10px] text-slate-400">{alerts.length} active</div>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-slate-500">
                      No active alerts right now.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {alerts.slice(0, 8).map((a: any) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setShowNotifications(false);
                            navigate('/');
                          }}
                          className="w-full text-left p-2.5 rounded-lg text-xs hover:bg-[#161a37] transition-colors flex items-start gap-2.5"
                        >
                          <ShieldAlert
                            className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                              a.severity === 'HIGH' ? 'text-rose-400' : 'text-amber-400'
                            }`}
                          />
                          <div>
                            <div className="font-semibold text-slate-200">{a.type?.replace(/_/g, ' ')}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{a.message}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="w-[1px] h-6 bg-purple-500/10" />

          {/* Profile — identity only; no way to switch to another account from here */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#12152d] border border-purple-500/15 hover:border-purple-500/40 transition-all text-xs text-slate-200"
            >
              <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-[10px] font-bold text-purple-200">
                {name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-semibold leading-none">{name}{roleLabel ? ` · ${roleLabel}` : ''}</div>
                <div className="text-[10px] text-slate-400 leading-none mt-0.5">{activeEmail}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-[#0e1022] border border-purple-500/20 rounded-xl shadow-2xl p-2 z-50">
                <div className="px-3 py-2 border-b border-purple-500/10 mb-1">
                  <div className="text-sm font-semibold text-white">{name}</div>
                  <div className="text-[11px] text-slate-400">{activeEmail}</div>
                </div>
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    logout();
                    navigate('/login');
                  }}
                  className="w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-center gap-2.5 text-rose-300 hover:bg-rose-950/30"
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold">Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Kill Switch Confirmation Modal */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0e1022] border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">
                {killSwitchActive ? 'Reset Global Kill Switch?' : 'Activate Global Kill Switch?'}
              </h3>
            </div>
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              {killSwitchActive
                ? 'Deactivating the kill switch will restore standard policy checks and allow outbound outreach to resume.'
                : 'Activating the global kill switch immediately halts all outbound SDR outreach across all campaigns, agents, and channels.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSwitchModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleKillSwitch}
                disabled={killLoading}
                className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all shadow-md ${
                  killSwitchActive
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {killLoading ? 'Processing...' : killSwitchActive ? 'Reset Kill Switch' : 'HALT ALL OUTREACH'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

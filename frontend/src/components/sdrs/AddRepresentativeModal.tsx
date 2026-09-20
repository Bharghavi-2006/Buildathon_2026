import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, AlertCircle, Plus, Check } from 'lucide-react';
import { representativesApi } from '../../api/representatives';
import { CreateRepresentativePayload } from '../../types';

interface AddRepresentativeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'UTC',
];

const CHANNELS_LIST = [
  { id: 'email', label: 'Email' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'message', label: 'Messages' },
  { id: 'call', label: 'Voice / Calls' },
];

export const AddRepresentativeModal: React.FC<AddRepresentativeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [maxCapacity, setMaxCapacity] = useState(50);
  const [timezone, setTimezone] = useState('America/New_York');
  const [channels, setChannels] = useState<string[]>(['email', 'linkedin']);
  const [specialties, setSpecialties] = useState<string[]>(['Enterprise SaaS']);
  const [specialtyInput, setSpecialtyInput] = useState('');
  const [regions, setRegions] = useState<string[]>(['US East']);
  const [regionInput, setRegionInput] = useState('');
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateRepresentativePayload) => {
      setErrorMessage(null);
      return await representativesApi.createRepresentative(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-representatives'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-representatives'] });
      onClose();
      // Reset form
      setName('');
      setEmail('');
      setMaxCapacity(50);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to create representative');
    },
  });

  if (!isOpen) return null;

  const addTag = (val: string, list: string[], setter: (v: string[]) => void, clearInput: () => void) => {
    const trimmed = val.trim();
    if (trimmed && !list.includes(trimmed)) {
      setter([...list, trimmed]);
    }
    clearInput();
  };

  const removeTag = (val: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.filter((x) => x !== val));
  };

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setErrorMessage('Name and valid email are required.');
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      max_active_leads: Number(maxCapacity),
      specialties,
      regions,
      supported_channels: channels,
      timezone,
      working_hours: { start: Number(startHour), end: Number(endHour) },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0c0e1f] border border-purple-500/20 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/10">
          <div>
            <h3 className="text-base font-bold text-white">Add Sales Representative</h3>
            <p className="text-xs text-slate-400 mt-0.5">Register a new SDR on the platform roster.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Full Name <span className="text-purple-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Connor"
                className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Email Address <span className="text-purple-400">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@demo.local"
                className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Timezone & Capacity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-white focus:outline-none focus:border-purple-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Max Lead Capacity</label>
              <input
                type="number"
                min={5}
                max={200}
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Supported Channels */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">Supported Channels</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CHANNELS_LIST.map((ch) => {
                const isSelected = channels.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChannel(ch.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-purple-600/30 border-purple-500/50 text-purple-200'
                        : 'bg-[#070811] border-purple-500/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{ch.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-purple-300" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Specialties / ICP */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Domain Specializations</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={specialtyInput}
                onChange={(e) => setSpecialtyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(specialtyInput, specialties, setSpecialties, () => setSpecialtyInput(''));
                  }
                }}
                placeholder="Type and press Enter (e.g. Enterprise SaaS, FinTech)..."
                className="flex-1 px-3 py-1.5 bg-[#070811] border border-purple-500/20 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={() => addTag(specialtyInput, specialties, setSpecialties, () => setSpecialtyInput(''))}
                className="px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 rounded-xl font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {specialties.map((spec) => (
                <span
                  key={spec}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-[11px]"
                >
                  {spec}
                  <button
                    type="button"
                    onClick={() => removeTag(spec, specialties, setSpecialties)}
                    className="hover:text-white ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Regions */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Regions / Territories</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(regionInput, regions, setRegions, () => setRegionInput(''));
                  }
                }}
                placeholder="Type and press Enter (e.g. US East, Global)..."
                className="flex-1 px-3 py-1.5 bg-[#070811] border border-purple-500/20 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={() => addTag(regionInput, regions, setRegions, () => setRegionInput(''))}
                className="px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 rounded-xl font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {regions.map((reg) => (
                <span
                  key={reg}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-[11px]"
                >
                  {reg}
                  <button
                    type="button"
                    onClick={() => removeTag(reg, regions, setRegions)}
                    className="hover:text-white ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Working Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Start Hour (24h)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">End Hour (24h)</label>
              <input
                type="number"
                min={0}
                max={24}
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#070811] border border-purple-500/20 rounded-xl text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-purple-500/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white text-xs font-semibold"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold shadow-lg shadow-purple-900/30 flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <span>Add Representative</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

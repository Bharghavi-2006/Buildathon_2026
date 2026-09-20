import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Dashboard } from '../pages/manager/Dashboard';
import { CampaignDetail } from '../pages/manager/CampaignDetail';
import { ProspectDetail } from '../pages/manager/ProspectDetail';
import { NewCampaign } from '../pages/manager/NewCampaign';
import { SdrsRoster } from '../pages/manager/SdrsRoster';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'campaigns/:id',
        element: <CampaignDetail />,
      },
      {
        path: 'campaigns/:campaignId/prospects/:prospectId',
        element: <ProspectDetail />,
      },
      {
        path: 'manager/sdrs',
        element: <SdrsRoster />,
      },
      {
        path: 'sdrs',
        element: <SdrsRoster />,
      },
      {
        path: 'reps',
        element: <SdrsRoster />,
      },
      {
        path: 'monitoring',
        element: (
          <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-8 text-center text-slate-400">
            <h2 className="text-xl font-bold text-white mb-2">Monitoring & SLAs</h2>
            <p className="text-sm">Approval turnaround, response rates, and queue monitoring will be loaded in the next vertical slice.</p>
          </div>
        ),
      },
      {
        path: 'settings',
        element: (
          <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-8 text-center text-slate-400">
            <h2 className="text-xl font-bold text-white mb-2">Platform Settings</h2>
            <p className="text-sm">Security policies, suppression lists, and channel rules.</p>
          </div>
        ),
      },
      {
        path: 'campaigns/new',
        element: <NewCampaign />,
      },
      {
        path: 'manager/campaigns/new',
        element: <NewCampaign />,
      },
      {
        path: 'rep/*',
        element: (
          <div className="bg-[#0c0e1f] border border-purple-500/10 rounded-2xl p-8 text-center text-slate-400">
            <h2 className="text-xl font-bold text-white mb-2">Representative Workspace</h2>
            <p className="text-sm">Switch identity to manager@demo.local to view the active P0 slice or continue to rep features.</p>
          </div>
        ),
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

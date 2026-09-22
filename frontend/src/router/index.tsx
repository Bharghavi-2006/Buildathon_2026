import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { AppLayout } from '../components/layout/AppLayout';
import { RepLayout } from '../components/layout/RepLayout';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/manager/Dashboard';
import { CampaignDetail } from '../pages/manager/CampaignDetail';
import { ProspectDetail } from '../pages/manager/ProspectDetail';
import { NewCampaign } from '../pages/manager/NewCampaign';
import { SdrsRoster } from '../pages/manager/SdrsRoster';
import { Monitoring } from '../pages/manager/Monitoring';
import { Settings } from '../pages/manager/Settings';
import { RepresentativeOverview } from '../pages/representative/Overview';
import { RepresentativeCampaigns } from '../pages/representative/Campaigns';
import { RepresentativeCampaignDetail } from '../pages/representative/CampaignDetail';
import { RepresentativeApprovalInbox } from '../pages/representative/ApprovalInbox';
import { RepresentativeMonitoring } from '../pages/representative/Monitoring';
import { RepresentativeConversations } from '../pages/representative/Conversations';
import { RepresentativeSettings } from '../pages/representative/Settings';
import { RepresentativeHurdles } from '../pages/representative/Hurdles';
import { RepresentativeGuardrails } from '../pages/representative/Guardrails';
import { Home } from '../pages/Home';

export const router = createBrowserRouter([
  {
    path: 'login',
    element: <Login />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Home /> },
          { path: 'campaigns/:id', element: <CampaignDetail /> },
          { path: 'campaigns/:campaignId/prospects/:prospectId', element: <ProspectDetail /> },
          { path: 'manager/sdrs', element: <SdrsRoster /> },
          { path: 'sdrs', element: <SdrsRoster /> },
          { path: 'reps', element: <SdrsRoster /> },
          { path: 'monitoring', element: <Monitoring /> },
          { path: 'settings', element: <Settings /> },
          { path: 'campaigns/new', element: <NewCampaign /> },
          { path: 'manager/campaigns/new', element: <NewCampaign /> },
        ],
      },
      {
        path: 'rep',
        element: <RepLayout />,
        children: [
          { index: true, element: <RepresentativeOverview /> },
          { path: 'campaigns', element: <RepresentativeCampaigns /> },
          { path: 'campaigns/:id', element: <RepresentativeCampaignDetail /> },
          { path: 'approvals', element: <RepresentativeApprovalInbox /> },
          { path: 'conversations', element: <RepresentativeConversations /> },
          { path: 'monitoring', element: <RepresentativeMonitoring /> },
          { path: 'hurdles', element: <RepresentativeHurdles /> },
          { path: 'guardrails', element: <RepresentativeGuardrails /> },
          { path: 'settings', element: <RepresentativeSettings /> },
          { path: '*', element: <Navigate to="/rep" replace /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

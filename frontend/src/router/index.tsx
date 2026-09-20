import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Dashboard } from '../pages/manager/Dashboard';
import { CampaignDetail } from '../pages/manager/CampaignDetail';
import { ProspectDetail } from '../pages/manager/ProspectDetail';
import { NewCampaign } from '../pages/manager/NewCampaign';
import { SdrsRoster } from '../pages/manager/SdrsRoster';
import { Monitoring } from '../pages/manager/Monitoring';
import { Settings } from '../pages/manager/Settings';
import { RepresentativeWorkspace } from '../pages/representative/Workspace';
import { RepresentativeHurdles } from '../pages/representative/Hurdles';
import { RepresentativeGuardrails } from '../pages/representative/Guardrails';
import { Home } from '../pages/Home';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Home />,
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
        element: <Monitoring />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'campaigns/new',
        element: <NewCampaign />,
      },
      {
        path: 'manager/campaigns/new',
        element: <NewCampaign />,
      },
      { path: 'rep/hurdles', element: <RepresentativeHurdles /> },
      { path: 'rep/guardrails', element: <RepresentativeGuardrails /> },
      { path: 'rep/*', element: <RepresentativeWorkspace /> },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

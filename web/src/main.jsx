/**
 * FollowCare — Application entry point
 * ARCHITECTURE.md Sections 4, 10.2
 *
 * Provider order (outermost → innermost):
 *   React.StrictMode → RouterProvider (with QueryClientProvider + AuthProvider inside layouts)
 *
 * TanStack Query and AuthProvider are mounted inside the router because
 * AuthProvider uses useNavigate-safe code paths and queries run within route context.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext.jsx';
import { router } from './app/router.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry once on failure; 401 will be caught by auth context
      retry: (failureCount, error) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 1;
      },
      staleTime: 30_000, // 30 s default — dashboard overrides to shorter
      refetchOnWindowFocus: true
    },
    mutations: {
      retry: false
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

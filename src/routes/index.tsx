import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { AppShell } from '@/layouts/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { NewBillPage } from '@/features/billing/NewBillPage';
import { BillsPage } from '@/features/bills/BillsPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { BrandsPage } from '@/features/brands/BrandsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ForbiddenPage } from '@/components/ForbiddenPage';
import { Skeleton } from '@/components/ui/Skeleton';

// Lazy-load heavy admin-only routes to keep billing bundle ultra-light
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const UsersPage = lazy(() =>
  import('@/features/users/UsersPage').then((m) => ({ default: m.UsersPage }))
);
const ActivityLogsPage = lazy(() =>
  import('@/features/logs/ActivityLogsPage').then((m) => ({ default: m.ActivityLogsPage }))
);

const LazyFallback = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-10 w-48" />
    <Skeleton className="h-64 w-full" />
  </div>
);

// Auth Route Guard
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text-muted text-sm">
        Loading session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// Admin Role Guard
const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

export const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* Default route redirect */}
        <Route
          index
          element={
            <Navigate
              to={user?.role === 'admin' ? '/dashboard' : '/billing'}
              replace
            />
          }
        />

        {/* Staff & Admin Common Routes */}
        <Route path="billing" element={<NewBillPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="brands" element={<BrandsPage />} />

        {/* Admin Only Routes (Lazy Loaded) */}
        <Route
          path="dashboard"
          element={
            <RequireAdmin>
              <Suspense fallback={<LazyFallback />}>
                <DashboardPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="reports"
          element={
            <RequireAdmin>
              <Suspense fallback={<LazyFallback />}>
                <ReportsPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="users"
          element={
            <RequireAdmin>
              <Suspense fallback={<LazyFallback />}>
                <UsersPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="logs"
          element={
            <RequireAdmin>
              <Suspense fallback={<LazyFallback />}>
                <ActivityLogsPage />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="settings"
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }
        />

        <Route path="403" element={<ForbiddenPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

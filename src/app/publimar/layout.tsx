'use client';

import DashboardLayout from '@/components/layouts/DashboardLayout';
import RoleGuard from '@/components/auth/RoleGuard';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <RoleGuard>{children}</RoleGuard>
    </DashboardLayout>
  );
}

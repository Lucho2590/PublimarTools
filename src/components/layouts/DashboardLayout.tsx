'use client';

import React, { ReactNode, useState, useEffect, useCallback } from "react";
import { useSigninCheck } from "reactfire";
import { signOut } from "firebase/auth";
import { useAuth } from "reactfire";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useUnviewedCount } from "@/hooks/useUnviewedCount";
import { Sidebar, MobileHeader } from "@/components/navigation";

interface IDashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: IDashboardLayoutProps) {
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const auth = useAuth();
  const { status, data: signInCheckResult } = useSigninCheck();
  const unviewedCount = useUnviewedCount();

  // Sincronizar sidebar con mobile/desktop
  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }, [isMobile]);

  const toggleItem = useCallback((itemName: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemName)
        ? prev.filter((name) => name !== itemName)
        : [itemName]
    );
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  }, [auth]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!signInCheckResult.signedIn) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-blue-100">
      {/* Sidebar */}
      <Sidebar
        isMobile={isMobile}
        isSidebarOpen={isSidebarOpen}
        expandedItems={expandedItems}
        unviewedCount={unviewedCount}
        onToggleSidebar={toggleSidebar}
        onCloseSidebar={closeSidebar}
        onToggleItem={toggleItem}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        {isMobile ? (
          <MobileHeader
            userEmail={signInCheckResult.user?.email}
            onToggleSidebar={toggleSidebar}
          />
        ) : (
          <header className="bg-white shadow-sm">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold"> </h1>
              </div>
              <div className="flex items-center">
                {status === "success" &&
                  signInCheckResult.signedIn &&
                  signInCheckResult.user && (
                    <span className="mr-4 hidden md:inline text-sm text-muted-foreground">
                      {signInCheckResult.user.email}
                    </span>
                  )}
              </div>
            </div>
          </header>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useMemo } from "react";
import { useFirestore } from "reactfire";
import { useAuth } from "@/contexts/AuthContext";
import {
  TAuditActor,
  TAuditInput,
  writeAuditLog,
} from "@/lib/auditLog";

export function useAuditLog() {
  const firestore = useFirestore();
  const { user, userData, userRole } = useAuth();

  const actor = useMemo<TAuditActor>(
    () => ({
      userId: user?.uid ?? null,
      userEmail: user?.email ?? null,
      userName: userData?.displayName ?? user?.email ?? null,
      userRole: userRole ?? null,
    }),
    [user, userData, userRole]
  );

  const logEvent = useCallback(
    (entry: TAuditInput) => writeAuditLog(firestore, actor, entry),
    [firestore, actor]
  );

  return { logEvent, actor };
}

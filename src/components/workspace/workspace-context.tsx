'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DockviewApi } from 'dockview';

import {
  createWorkspaceLayoutStorage,
  type WorkspaceLayoutStorage,
} from './use-workspace-layout';

type WorkspaceContextValue = {
  storage: WorkspaceLayoutStorage;
  defaultLayout: (api: DockviewApi) => void;
  resetDockLayout: () => void;
  dockLayoutVersion: number;
  /** @internal Used by WorkspaceDock only */
  registerDockApi: (api: DockviewApi | null) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  storageKey,
  defaultLayout,
  children,
}: {
  storageKey: string;
  defaultLayout: (api: DockviewApi) => void;
  children: ReactNode;
}) {
  const [dockLayoutVersion, setDockLayoutVersion] = useState(0);
  const dockApiRef = useRef<DockviewApi | null>(null);

  const storage = useMemo(() => createWorkspaceLayoutStorage(storageKey), [storageKey]);

  const registerDockApi = useCallback((api: DockviewApi | null) => {
    dockApiRef.current = api;
  }, []);

  const resetDockLayout = useCallback(() => {
    storage.clear();
    setDockLayoutVersion((v) => v + 1);
  }, [storage]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      storage,
      defaultLayout,
      resetDockLayout,
      dockLayoutVersion,
      registerDockApi,
    }),
    [storage, defaultLayout, resetDockLayout, dockLayoutVersion, registerDockApi],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

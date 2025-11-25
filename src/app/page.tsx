'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Plus,
  Activity,
  Settings,
  Wifi,
  WifiOff,
  Server,
  ChevronRight,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useNodeODM } from '@/hooks/use-nodeodm';
import { SettingsDialog } from '@/components/layout';
import { NewJobView } from '@/components/views/new-job-view';
import { JobStatusView } from '@/components/views/job-status-view';

type View = 'new-job' | 'job-status';

export default function Home() {
  const {
    isConnected,
    nodeInfo,
    connect,
    baseUrl,
    token,
    setBaseUrl,
    setToken,
    tasks,
    isLoadingTasks,
    refreshTasks,
    createTask,
    cancelTask,
    removeTask,
    restartTask,
    getTaskOutput,
    getDownloadUrl,
    odmOptions,
    loadOptions,
  } = useNodeODM();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<View>('new-job');

  // Count running tasks
  const runningTasks = tasks.filter(t => t.status.code === 20).length;
  const queuedTasks = tasks.filter(t => t.status.code === 10).length;

  const handleSettingsSave = useCallback(
    (newUrl: string, newToken?: string) => {
      setBaseUrl(newUrl);
      if (newToken) setToken(newToken);
      connect();
    },
    [setBaseUrl, setToken, connect]
  );

  const handleTestConnection = useCallback(
    async (testUrl: string, testToken?: string) => {
      const originalUrl = baseUrl;
      const originalToken = token;

      setBaseUrl(testUrl);
      if (testToken) setToken(testToken);

      const success = await connect();

      if (!success) {
        setBaseUrl(originalUrl);
        if (originalToken) setToken(originalToken);
      }

      return success;
    },
    [baseUrl, token, setBaseUrl, setToken, connect]
  );

  return (
    <div className="h-screen flex bg-background">
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          style: {
            background: '#0a0a0a',
            border: '1px solid #262626',
            color: '#ffffff',
            borderRadius: '2px',
          },
        }}
      />

      {/* Left Sidebar - Navigation */}
      <aside className="w-64 border-r bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white flex items-center justify-center">
              <span className="text-black font-bold text-lg">C</span>
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wider uppercase">CursedODM</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Drone Mapping
              </p>
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="p-4 border-b">
          <div className={cn(
            'flex items-center gap-2 text-xs uppercase tracking-wider',
            isConnected ? 'text-[#00ff88]' : 'text-[#ff3333]'
          )}>
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Online' : 'Offline'}
          </div>
          {nodeInfo && (
            <div className="mt-2 text-[10px] text-muted-foreground uppercase tracking-wider">
              <div className="flex items-center gap-1">
                <Server className="h-3 w-3" />
                {nodeInfo.engine} v{nodeInfo.engineVersion}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          <button
            onClick={() => setActiveView('new-job')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-3 text-sm uppercase tracking-wider transition-colors',
              'hover:bg-accent',
              activeView === 'new-job' 
                ? 'bg-accent text-white border-l-2 border-white' 
                : 'text-muted-foreground'
            )}
          >
            <Plus className="h-4 w-4" />
            New Job
            <ChevronRight className={cn(
              'h-4 w-4 ml-auto transition-transform',
              activeView === 'new-job' && 'rotate-90'
            )} />
          </button>

          <button
            onClick={() => setActiveView('job-status')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-3 text-sm uppercase tracking-wider transition-colors',
              'hover:bg-accent',
              activeView === 'job-status' 
                ? 'bg-accent text-white border-l-2 border-white' 
                : 'text-muted-foreground'
            )}
          >
            <Activity className="h-4 w-4" />
            Job Status
            {(runningTasks > 0 || queuedTasks > 0) && (
              <Badge 
                variant="outline" 
                className={cn(
                  'ml-auto text-[10px] border-0',
                  runningTasks > 0 ? 'bg-[#00ccff]/20 text-[#00ccff]' : 'bg-[#ffcc00]/20 text-[#ffcc00]'
                )}
              >
                {runningTasks > 0 ? runningTasks : queuedTasks}
              </Badge>
            )}
            <ChevronRight className={cn(
              'h-4 w-4 transition-transform',
              activeView === 'job-status' && 'rotate-90'
            )} />
          </button>
        </nav>

        {/* Footer */}
        <div className="p-2 border-t">
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 text-sm uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-white transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'new-job' && (
          <NewJobView
            odmOptions={odmOptions}
            isConnected={isConnected}
            onCreateTask={createTask}
            onTaskCreated={() => {
              setActiveView('job-status');
              refreshTasks();
            }}
          />
        )}

        {activeView === 'job-status' && (
          <JobStatusView
            tasks={tasks}
            isLoading={isLoadingTasks}
            onRefresh={refreshTasks}
            onCancelTask={cancelTask}
            onRemoveTask={removeTask}
            onRestartTask={restartTask}
            onDownloadTask={(uuid) => {
              const url = getDownloadUrl(uuid);
              window.open(url, '_blank');
            }}
            getTaskOutput={getTaskOutput}
            baseUrl={baseUrl}
          />
        )}
      </main>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        baseUrl={baseUrl}
        token={token}
        onSave={handleSettingsSave}
        onTest={handleTestConnection}
      />
    </div>
  );
}

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
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Download,
  MoreVertical,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { TaskInfo, TaskStatusCode } from '@/lib/types/nodeodm';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useNodeODM } from '@/hooks/use-nodeodm';
import { SettingsDialog } from '@/components/layout';
import { NewJobView } from '@/components/views/new-job-view';
import { JobStatusView } from '@/components/views/job-status-view';

type View = 'new-job' | 'job-status';

const statusConfig: Record<TaskStatusCode, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  10: { icon: Clock, color: 'text-[#ffcc00]', label: 'QUEUED' },
  20: { icon: Loader2, color: 'text-[#00ccff]', label: 'RUNNING' },
  30: { icon: XCircle, color: 'text-[#ff3333]', label: 'FAILED' },
  40: { icon: CheckCircle2, color: 'text-[#00ff88]', label: 'COMPLETED' },
  50: { icon: AlertCircle, color: 'text-[#737373]', label: 'CANCELED' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

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
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();

  // Count running tasks
  const runningTasks = tasks.filter(t => t.status.code === 20).length;
  const queuedTasks = tasks.filter(t => t.status.code === 10).length;

  // Sort tasks
  const sortedTasks = [...tasks].sort((a, b) => {
    const order = { 20: 0, 10: 1, 30: 2, 40: 3, 50: 4 };
    const aOrder = order[a.status.code] ?? 5;
    const bOrder = order[b.status.code] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.dateCreated - a.dateCreated;
  });

  // Auto-select first running task when tasks change
  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0 && activeView === 'job-status') {
      const running = tasks.find(t => t.status.code === 20);
      setSelectedTaskId(running?.uuid || tasks[0]?.uuid);
    }
  }, [tasks, selectedTaskId, activeView]);

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

      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Sidebar - Navigation */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
          <aside className="h-full border-r bg-sidebar flex flex-col">
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
        <nav className="flex-1 p-2 overflow-y-auto min-h-0">
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

          <div>
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

            {/* Job List as nested children - Always expanded */}
            <div className="pl-4 pr-2 pb-2">
              {/* Task List */}
              {sortedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Activity className="h-6 w-6 mb-2 opacity-30" />
                  <p className="text-[10px] uppercase tracking-wider">No jobs found</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {sortedTasks.map((task) => {
                      const status = statusConfig[task.status.code];
                      const StatusIcon = status.icon;
                      const isRunning = task.status.code === 20;
                      const isSelected = task.uuid === selectedTaskId;

                      return (
                        <div
                          key={task.uuid}
                          onClick={() => {
                            setSelectedTaskId(task.uuid);
                            setActiveView('job-status');
                          }}
                          className={cn(
                            'p-2 cursor-pointer transition-colors rounded',
                            'hover:bg-accent',
                            isSelected && 'bg-accent border-l-2 border-white'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <StatusIcon className={cn(
                              'h-3 w-3 mt-0.5 flex-shrink-0',
                              status.color,
                              isRunning && 'animate-spin'
                            )} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-medium truncate">
                                  {task.name || 'Untitled'}
                                </span>
                                <Badge 
                                  variant="outline" 
                                  className={cn('text-[9px] border-0 uppercase px-1', status.color)}
                                >
                                  {status.label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground uppercase tracking-wider">
                                <span>{task.imagesCount} imgs</span>
                                <span>{formatDuration(task.processingTime)}</span>
                              </div>
                              {(isRunning || task.progress > 0) && task.progress < 100 && (
                                <div className="mt-1">
                                  <Progress value={task.progress} className="h-0.5" />
                                  <span className="text-[9px] text-muted-foreground">{task.progress}%</span>
                                </div>
                              )}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-5 w-5">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover border-border">
                                {task.status.code === 40 && (
                                  <DropdownMenuItem onClick={() => {
                                    const url = getDownloadUrl(task.uuid);
                                    window.open(url, '_blank');
                                  }}>
                                    <Download className="h-3 w-3 mr-2" />
                                    Download
                                  </DropdownMenuItem>
                                )}
                                {(task.status.code === 10 || task.status.code === 20) && (
                                  <DropdownMenuItem onClick={() => cancelTask(task.uuid)}>
                                    <XCircle className="h-3 w-3 mr-2" />
                                    Cancel
                                  </DropdownMenuItem>
                                )}
                                {(task.status.code === 30 || task.status.code === 40 || task.status.code === 50) && (
                                  <DropdownMenuItem onClick={() => restartTask(task.uuid)}>
                                    <RefreshCw className="h-3 w-3 mr-2" />
                                    Restart
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={() => removeTask(task.uuid)}
                                  className="text-[#ff3333]"
                                >
                                  <Trash2 className="h-3 w-3 mr-2" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Refresh button at end of list */}
                {sortedTasks.length > 0 && (
                  <div className="pt-2 flex justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => refreshTasks()}
                      disabled={isLoadingTasks}
                      className="h-5 w-5"
                      title="Refresh jobs"
                    >
                      <RefreshCw className={cn('h-3 w-3', isLoadingTasks && 'animate-spin')} />
                    </Button>
                  </div>
                )}
              </div>
          </div>
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
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Main Content */}
        <ResizablePanel defaultSize={80} minSize={60}>
          <main className="h-full flex flex-col overflow-hidden">
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
            selectedTaskId={selectedTaskId}
            onTaskSelect={setSelectedTaskId}
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
        </ResizablePanel>
      </ResizablePanelGroup>

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

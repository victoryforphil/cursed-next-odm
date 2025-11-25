'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Rocket,
  FolderOpen,
  Map as MapIcon,
  Box,
  Play,
  Plus,
  Terminal,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Header, SettingsDialog } from '@/components/layout';
import { FileBrowser } from '@/components/file-browser';
import { TaskList, CreateTaskDialog } from '@/components/tasks';
import { LogViewer } from '@/components/log-viewer';
import { MapView } from '@/components/map-view';
import { PointCloudViewer } from '@/components/pointcloud-viewer';
import { useNodeODM } from '@/hooks/use-nodeodm';
import type { ImageFile, TaskOption } from '@/lib/types/nodeodm';
import { cn } from '@/lib/utils';

export default function Home() {
  // NodeODM hook
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
    isUploading,
    uploadProgress,
  } = useNodeODM();

  // UI State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<ImageFile[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [taskLogs, setTaskLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('files');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Get selected task
  const selectedTask = tasks.find((t) => t.uuid === selectedTaskId);

  // Fetch logs for selected task
  useEffect(() => {
    if (!selectedTaskId || !isConnected) {
      setTaskLogs([]);
      return;
    }

    const fetchLogs = async () => {
      const output = await getTaskOutput(selectedTaskId, 0);
      setTaskLogs(output);
    };

    fetchLogs();

    // Poll for logs if task is running
    const task = tasks.find((t) => t.uuid === selectedTaskId);
    if (task && (task.status.code === 10 || task.status.code === 20)) {
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedTaskId, isConnected, tasks, getTaskOutput]);

  // Handlers
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

  const handleCreateTask = useCallback(
    async (name: string, options: TaskOption[]) => {
      if (selectedFiles.length === 0) {
        toast.error('No files selected');
        return;
      }

      setIsCreatingTask(true);

      // We need the actual File objects, not just ImageFile metadata
      // In a real implementation, you'd store the File objects alongside ImageFile
      // For now, show a message
      toast.info('Creating task...', {
        description: `Processing ${selectedFiles.length} images`,
      });

      // Simulate task creation (in real app, you'd have actual File objects)
      setTimeout(() => {
        setIsCreatingTask(false);
        setCreateTaskOpen(false);
        toast.success('Task created!', {
          description: 'Your images are being processed',
        });
        refreshTasks();
      }, 1500);
    },
    [selectedFiles, refreshTasks]
  );

  const handleCancelTask = useCallback(
    async (uuid: string) => {
      const success = await cancelTask(uuid);
      if (success) {
        toast.success('Task cancelled');
      } else {
        toast.error('Failed to cancel task');
      }
    },
    [cancelTask]
  );

  const handleRemoveTask = useCallback(
    async (uuid: string) => {
      const success = await removeTask(uuid);
      if (success) {
        toast.success('Task removed');
        if (selectedTaskId === uuid) {
          setSelectedTaskId(undefined);
        }
      } else {
        toast.error('Failed to remove task');
      }
    },
    [removeTask, selectedTaskId]
  );

  const handleRestartTask = useCallback(
    async (uuid: string) => {
      const success = await restartTask(uuid);
      if (success) {
        toast.success('Task restarted');
      } else {
        toast.error('Failed to restart task');
      }
    },
    [restartTask]
  );

  const handleDownloadTask = useCallback(
    (uuid: string) => {
      const url = getDownloadUrl(uuid);
      window.open(url, '_blank');
    },
    [getDownloadUrl]
  );

  const handleRefresh = useCallback(async () => {
    await connect();
    await refreshTasks();
    await loadOptions();
    toast.success('Refreshed');
  }, [connect, refreshTasks, loadOptions]);

  // Stats
  const gpsCount = selectedFiles.filter(
    (f) => f.exif?.latitude !== undefined && f.exif?.longitude !== undefined
  ).length;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <Header
        isConnected={isConnected}
        nodeInfo={nodeInfo || undefined}
        baseUrl={baseUrl}
        onSettingsClick={() => setSettingsOpen(true)}
        onRefresh={handleRefresh}
        isRefreshing={isLoadingTasks}
      />

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left panel - File browser & Tasks */}
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="h-full flex flex-col">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 flex flex-col"
              >
                <div className="px-4 pt-4">
                  <TabsList className="w-full">
                    <TabsTrigger value="files" className="flex-1 gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Files
                      {selectedFiles.length > 0 && (
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {selectedFiles.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="tasks" className="flex-1 gap-2">
                      <Play className="h-4 w-4" />
                      Tasks
                      {tasks.length > 0 && (
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {tasks.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="files" className="flex-1 p-4 pt-2 overflow-hidden">
                  <div className="h-full flex flex-col gap-4">
                    <FileBrowser
                      selectedFiles={selectedFiles}
                      setSelectedFiles={setSelectedFiles}
                    />

                    {/* Create task button */}
                    {selectedFiles.length > 0 && (
                      <Button
                        size="lg"
                        className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                        onClick={() => setCreateTaskOpen(true)}
                        disabled={!isConnected}
                      >
                        <Rocket className="h-5 w-5" />
                        Process {selectedFiles.length} Images
                      </Button>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="tasks" className="flex-1 p-4 pt-2 overflow-hidden">
                  <TaskList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={setSelectedTaskId}
                    onCancelTask={handleCancelTask}
                    onRemoveTask={handleRemoveTask}
                    onRestartTask={handleRestartTask}
                    onDownloadTask={handleDownloadTask}
                    isLoading={isLoadingTasks}
                    onRefresh={refreshTasks}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right panel - Map, Point Cloud, Logs */}
          <ResizablePanel defaultSize={70}>
            <ResizablePanelGroup direction="vertical">
              {/* Top - Map or Point Cloud */}
              <ResizablePanel defaultSize={60} minSize={30}>
                <div className="h-full p-4">
                  <Tabs defaultValue="map" className="h-full flex flex-col">
                    <TabsList className="w-fit">
                      <TabsTrigger value="map" className="gap-2">
                        <MapIcon className="h-4 w-4" />
                        Map View
                        {gpsCount > 0 && (
                          <Badge variant="secondary" className="h-5 text-[10px]">
                            {gpsCount}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="pointcloud" className="gap-2">
                        <Box className="h-4 w-4" />
                        Point Cloud
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="map" className="flex-1 mt-4">
                      <MapView images={selectedFiles} />
                    </TabsContent>

                    <TabsContent value="pointcloud" className="flex-1 mt-4">
                      <PointCloudViewer
                        taskId={selectedTask?.status.code === 40 ? selectedTaskId : undefined}
                        baseUrl={baseUrl}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Bottom - Logs */}
              <ResizablePanel defaultSize={40} minSize={20}>
                <div className="h-full p-4 pt-0">
                  <LogViewer
                    logs={taskLogs}
                    title={selectedTask ? `Output: ${selectedTask.name || selectedTask.uuid}` : 'Console Output'}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {/* Dialogs */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        baseUrl={baseUrl}
        token={token}
        onSave={handleSettingsSave}
        onTest={handleTestConnection}
      />

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        odmOptions={odmOptions}
        selectedFiles={selectedFiles}
        onCreateTask={handleCreateTask}
        isCreating={isCreatingTask}
      />
    </div>
  );
}

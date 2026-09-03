'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  WorkspaceProvider,
  WorkspaceDock,
  useWorkspace,
  buildJobStatusLayout,
  type DockviewComponents,
} from '@/components/workspace';
import { PointCloudViewer } from '@/components/pointcloud-viewer';
import { OrthomosaicViewer } from '@/components/orthomosaic-viewer';
import { LogViewer } from '@/components/log-viewer';
import type { TaskInfo } from '@/lib/types/nodeodm';

interface JobStatusViewProps {
  tasks: TaskInfo[];
  isLoading: boolean;
  selectedTaskId?: string;
  onTaskSelect: (uuid: string | undefined) => void;
  onCancelTask: (uuid: string) => Promise<boolean>;
  onRemoveTask: (uuid: string) => Promise<boolean>;
  onRestartTask: (uuid: string) => Promise<boolean>;
  onDownloadTask: (uuid: string) => void;
  getTaskOutput: (uuid: string, line?: number) => Promise<string[]>;
  baseUrl: string;
}

// Panel data flows through a view-local context so the dockview component
// registry stays a stable module-scope reference (no panel remounts).
type JobPanels = {
  assetTaskId?: string;
  baseUrl: string;
  logs: string[];
  logTitle: string;
};

const JobPanelsContext = createContext<JobPanels | null>(null);

function useJobPanels() {
  const ctx = useContext(JobPanelsContext);
  if (!ctx) throw new Error('useJobPanels must be used within JobPanelsContext.Provider');
  return ctx;
}

function PointCloudPanel() {
  const { assetTaskId, baseUrl } = useJobPanels();
  return <PointCloudViewer taskId={assetTaskId} baseUrl={baseUrl} className="h-full" />;
}

function OrthomosaicPanel() {
  const { assetTaskId, baseUrl } = useJobPanels();
  return <OrthomosaicViewer taskId={assetTaskId} baseUrl={baseUrl} className="h-full" />;
}

function LogsPanel() {
  const { logs, logTitle } = useJobPanels();
  return (
    <div className="h-full bg-black">
      <LogViewer logs={logs} title={logTitle} className="h-full" />
    </div>
  );
}

function ResetLayoutButton() {
  const { resetDockLayout } = useWorkspace();
  return (
    <Button variant="outline" size="sm" onClick={resetDockLayout} title="Reset dock layout">
      <RotateCcw className="h-3.5 w-3.5 mr-1" />
      Reset Layout
    </Button>
  );
}

export function JobStatusView({
  tasks,
  selectedTaskId,
  onDownloadTask,
  getTaskOutput,
  baseUrl,
}: JobStatusViewProps) {
  const [taskLogs, setTaskLogs] = useState<string[]>([]);

  const selectedTask = tasks.find(t => t.uuid === selectedTaskId);

  // Fetch logs
  useEffect(() => {
    if (!selectedTaskId) {
      setTaskLogs([]);
      return;
    }

    const fetchLogs = async () => {
      const output = await getTaskOutput(selectedTaskId, 0);
      setTaskLogs(output);
    };

    fetchLogs();

    const task = tasks.find(t => t.uuid === selectedTaskId);
    if (task && (task.status.code === 10 || task.status.code === 20)) {
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [selectedTaskId, tasks, getTaskOutput]);

  const completed = selectedTask?.status.code === 40;

  const panelComponents = useMemo<DockviewComponents>(
    () => ({
      pointcloud: PointCloudPanel,
      orthomosaic: OrthomosaicPanel,
      logs: LogsPanel,
    }),
    [],
  );

  const panelValue = useMemo<JobPanels>(
    () => ({
      assetTaskId: completed ? selectedTaskId : undefined,
      baseUrl,
      logs: taskLogs,
      logTitle: selectedTask?.name || 'Console Output',
    }),
    [completed, selectedTaskId, baseUrl, taskLogs, selectedTask],
  );

  return (
    <WorkspaceProvider storageKey="odm-workspace-layout-v1" defaultLayout={buildJobStatusLayout}>
      <JobPanelsContext.Provider value={panelValue}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col bg-card min-h-0">
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wider truncate">
                {selectedTask?.name || 'Select a job'}
              </h2>
              <ResetLayoutButton />
            </div>

            <div className="flex-1 min-h-0">
              <WorkspaceDock components={panelComponents} />
            </div>

            {completed && selectedTask && (
              <div className="p-4 border-t">
                <Button
                  className="w-full bg-white text-black hover:bg-gray-200 uppercase tracking-wider"
                  onClick={() => onDownloadTask(selectedTask.uuid)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download All Results
                </Button>
              </div>
            )}
          </div>
        </div>
      </JobPanelsContext.Provider>
    </WorkspaceProvider>
  );
}

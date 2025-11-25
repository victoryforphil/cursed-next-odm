'use client';

import React, { useState, useEffect } from 'react';
import {
  Download,
  Box,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

export function JobStatusView({
  tasks,
  selectedTaskId,
  onDownloadTask,
  getTaskOutput,
  baseUrl,
}: JobStatusViewProps) {
  const [taskLogs, setTaskLogs] = useState<string[]>([]);
  const [viewType, setViewType] = useState<'pointcloud' | 'orthomosaic' | 'logs'>('logs');

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Main Content Area: Tabs for Point Cloud / Orthomosaic / Logs */}
      <div className="flex-1 flex flex-col bg-card">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              {viewType === 'logs' && <Terminal className="h-4 w-4" />}
              {viewType === 'pointcloud' && <Box className="h-4 w-4" />}
              {viewType === 'orthomosaic' && <Box className="h-4 w-4" />}
              {selectedTask?.name || 'Select a job'}
            </h2>
          </div>
          
          {/* View type tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setViewType('logs')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
                'border border-border',
                viewType === 'logs'
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent hover:bg-accent'
              )}
            >
              Logs
            </button>
            <button
              onClick={() => setViewType('pointcloud')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
                'border border-border',
                viewType === 'pointcloud'
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent hover:bg-accent'
              )}
            >
              Point Cloud
            </button>
            <button
              onClick={() => setViewType('orthomosaic')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
                'border border-border',
                viewType === 'orthomosaic'
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent hover:bg-accent'
              )}
            >
              Orthomosaic
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {viewType === 'logs' ? (
            <div className="h-full bg-black">
              <LogViewer
                logs={taskLogs}
                title={selectedTask?.name || 'Console Output'}
                className="h-full"
              />
            </div>
          ) : viewType === 'pointcloud' ? (
            <PointCloudViewer
              taskId={selectedTask?.status.code === 40 ? selectedTaskId : undefined}
              baseUrl={baseUrl}
              className="h-full"
            />
          ) : (
            <OrthomosaicViewer
              taskId={selectedTask?.status.code === 40 ? selectedTaskId : undefined}
              baseUrl={baseUrl}
              className="h-full"
            />
          )}
        </div>

        {selectedTask?.status.code === 40 && viewType !== 'logs' && (
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
  );
}


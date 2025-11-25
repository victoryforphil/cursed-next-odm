'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Download,
  Box,
  MoreVertical,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { PointCloudViewer } from '@/components/pointcloud-viewer';
import { LogViewer } from '@/components/log-viewer';
import type { TaskInfo, TaskStatusCode } from '@/lib/types/nodeodm';

interface JobStatusViewProps {
  tasks: TaskInfo[];
  isLoading: boolean;
  onRefresh: () => void;
  onCancelTask: (uuid: string) => Promise<boolean>;
  onRemoveTask: (uuid: string) => Promise<boolean>;
  onRestartTask: (uuid: string) => Promise<boolean>;
  onDownloadTask: (uuid: string) => void;
  getTaskOutput: (uuid: string, line?: number) => Promise<string[]>;
  baseUrl: string;
}

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

export function JobStatusView({
  tasks,
  isLoading,
  onRefresh,
  onCancelTask,
  onRemoveTask,
  onRestartTask,
  onDownloadTask,
  getTaskOutput,
  baseUrl,
}: JobStatusViewProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [taskLogs, setTaskLogs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedTask = tasks.find(t => t.uuid === selectedTaskId);

  // Sort tasks
  const sortedTasks = [...tasks].sort((a, b) => {
    const order = { 20: 0, 10: 1, 30: 2, 40: 3, 50: 4 };
    const aOrder = order[a.status.code] ?? 5;
    const bOrder = order[b.status.code] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.dateCreated - a.dateCreated;
  });

  // Filter tasks
  const filteredTasks = sortedTasks.filter(t => 
    !searchQuery || 
    t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.uuid.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  // Auto-select first running task
  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0) {
      const running = tasks.find(t => t.status.code === 20);
      setSelectedTaskId(running?.uuid || tasks[0]?.uuid);
    }
  }, [tasks, selectedTaskId]);


  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Task List */}
      <div className="w-[350px] border-r flex flex-col bg-card">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">Jobs</h2>
            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
              {tasks.length} total
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-8 w-8"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Search */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-input border-border"
            />
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Activity className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-xs uppercase tracking-wider">No jobs found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredTasks.map((task) => {
                const status = statusConfig[task.status.code];
                const StatusIcon = status.icon;
                const isRunning = task.status.code === 20;
                const isSelected = task.uuid === selectedTaskId;

                return (
                  <div
                    key={task.uuid}
                    onClick={() => setSelectedTaskId(task.uuid)}
                    className={cn(
                      'p-3 cursor-pointer transition-colors',
                      'hover:bg-accent',
                      isSelected && 'bg-accent border-l-2 border-white'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <StatusIcon className={cn(
                        'h-4 w-4 mt-0.5 flex-shrink-0',
                        status.color,
                        isRunning && 'animate-spin'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">
                            {task.name || 'Untitled'}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={cn('text-[10px] border-0 uppercase', status.color)}
                          >
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                          <span>{task.imagesCount} imgs</span>
                          <span>{formatDuration(task.processingTime)}</span>
                        </div>
                        {(isRunning || task.progress > 0) && task.progress < 100 && (
                          <div className="mt-2">
                            <Progress value={task.progress} className="h-1" />
                            <span className="text-[10px] text-muted-foreground">{task.progress}%</span>
                          </div>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border-border">
                          {task.status.code === 40 && (
                            <DropdownMenuItem onClick={() => onDownloadTask(task.uuid)}>
                              <Download className="h-3 w-3 mr-2" />
                              Download
                            </DropdownMenuItem>
                          )}
                          {(task.status.code === 10 || task.status.code === 20) && (
                            <DropdownMenuItem onClick={() => onCancelTask(task.uuid)}>
                              <XCircle className="h-3 w-3 mr-2" />
                              Cancel
                            </DropdownMenuItem>
                          )}
                          {(task.status.code === 30 || task.status.code === 40 || task.status.code === 50) && (
                            <DropdownMenuItem onClick={() => onRestartTask(task.uuid)}>
                              <RefreshCw className="h-3 w-3 mr-2" />
                              Restart
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => onRemoveTask(task.uuid)}
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
        </div>
      </div>

      {/* Center: Console Output */}
      <div className="flex-1 flex flex-col bg-black">
        <LogViewer
          logs={taskLogs}
          title={selectedTask?.name || 'Console Output'}
          className="h-full"
        />
      </div>

      {/* Right: Point Cloud / Results */}
      <div className="w-[400px] border-l flex flex-col bg-card">
        <div className="p-4 border-b">
          <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Box className="h-4 w-4" />
            Results
          </h2>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
            Point cloud preview
          </p>
        </div>

        <div className="flex-1 overflow-hidden">
          <PointCloudViewer
            taskId={selectedTask?.status.code === 40 ? selectedTaskId : undefined}
            baseUrl={baseUrl}
            className="h-full"
          />
        </div>

        {selectedTask?.status.code === 40 && (
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


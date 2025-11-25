'use client';

import React from 'react';
import {
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  MoreVertical,
  Trash2,
  RefreshCw,
  Download,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { TaskInfo, TaskStatusCode } from '@/lib/types/nodeodm';
import { TaskStatusMap } from '@/lib/types/nodeodm';

interface TaskListProps {
  tasks: TaskInfo[];
  selectedTaskId?: string;
  onSelectTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onRestartTask: (taskId: string) => void;
  onDownloadTask: (taskId: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

const statusConfig: Record<
  TaskStatusCode,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
  }
> = {
  10: {
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  20: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  30: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  40: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  50: {
    icon: AlertCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

interface TaskItemProps {
  task: TaskInfo;
  isSelected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onRestart: () => void;
  onDownload: () => void;
}

function TaskItem({
  task,
  isSelected,
  onSelect,
  onCancel,
  onRemove,
  onRestart,
  onDownload,
}: TaskItemProps) {
  const status = statusConfig[task.status.code];
  const StatusIcon = status.icon;
  const isRunning = task.status.code === 20;
  const isCompleted = task.status.code === 40;
  const canCancel = task.status.code === 10 || task.status.code === 20;
  const canRestart =
    task.status.code === 30 ||
    task.status.code === 40 ||
    task.status.code === 50;

  return (
    <div
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all',
        'hover:border-primary/50 hover:bg-accent/50',
        isSelected && 'border-primary bg-accent'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn('p-2 rounded-lg', status.bgColor)}>
            <StatusIcon
              className={cn(
                'h-4 w-4',
                status.color,
                isRunning && 'animate-spin'
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium truncate">
                {task.name || 'Untitled Task'}
              </h4>
              <Badge
                variant="outline"
                className={cn('text-xs', status.color)}
              >
                {TaskStatusMap[task.status.code]}
              </Badge>
            </div>

            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span>{task.imagesCount} images</span>
              <span>{formatDate(task.dateCreated)}</span>
              {task.processingTime > 0 && (
                <span>{formatDuration(task.processingTime)}</span>
              )}
            </div>

            {(isRunning || task.progress > 0) && (
              <div className="mt-2 space-y-1">
                <Progress value={task.progress} className="h-1.5" />
                <span className="text-xs text-muted-foreground">
                  {task.progress}% complete
                </span>
              </div>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSelect}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {isCompleted && (
              <DropdownMenuItem onClick={onDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download Results
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {canCancel && (
              <DropdownMenuItem
                onClick={onCancel}
                className="text-amber-600"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Task
              </DropdownMenuItem>
            )}
            {canRestart && (
              <DropdownMenuItem onClick={onRestart}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Restart Task
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onRemove}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function TaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  onCancelTask,
  onRemoveTask,
  onRestartTask,
  onDownloadTask,
  isLoading,
  onRefresh,
}: TaskListProps) {
  // Sort tasks: running first, then queued, then by date
  const sortedTasks = [...tasks].sort((a, b) => {
    const statusOrder = { 20: 0, 10: 1, 30: 2, 40: 3, 50: 4 };
    const aOrder = statusOrder[a.status.code] ?? 5;
    const bOrder = statusOrder[b.status.code] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.dateCreated - a.dateCreated;
  });

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Play className="h-5 w-5" />
            Tasks
            {tasks.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {tasks.length}
              </Badge>
            )}
          </CardTitle>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full -mx-4 px-4">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Play className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">No tasks yet</p>
              <p className="text-xs mt-1">
                Create a new task to start processing
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedTasks.map((task) => (
                <TaskItem
                  key={task.uuid}
                  task={task}
                  isSelected={task.uuid === selectedTaskId}
                  onSelect={() => onSelectTask(task.uuid)}
                  onCancel={() => onCancelTask(task.uuid)}
                  onRemove={() => onRemoveTask(task.uuid)}
                  onRestart={() => onRestartTask(task.uuid)}
                  onDownload={() => onDownloadTask(task.uuid)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


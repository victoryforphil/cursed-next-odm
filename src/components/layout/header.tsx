'use client';

import React from 'react';
import {
  Plane,
  Settings,
  Wifi,
  WifiOff,
  Server,
  RefreshCw,
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { NodeInfo } from '@/lib/types/nodeodm';

interface HeaderProps {
  isConnected: boolean;
  nodeInfo?: NodeInfo;
  baseUrl: string;
  onSettingsClick: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function Header({
  isConnected,
  nodeInfo,
  baseUrl,
  onSettingsClick,
  onRefresh,
  isRefreshing,
}: HeaderProps) {
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(prefersDark);
    document.documentElement.classList.toggle('dark', prefersDark);
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark', !isDark);
  };

  return (
    <header className="h-14 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-50">
      {/* Logo and title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
          <Plane className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight">
            Cursed<span className="text-emerald-500">ODM</span>
          </h1>
          <p className="text-[10px] text-muted-foreground -mt-0.5">
            OpenDroneMap Frontend
          </p>
        </div>
      </div>

      {/* Center - Connection status */}
      <div className="flex items-center gap-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                )}
              >
                {isConnected ? (
                  <Wifi className="h-3.5 w-3.5" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5" />
                )}
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <p className="font-medium">{baseUrl}</p>
                {nodeInfo && (
                  <div className="mt-1 text-muted-foreground">
                    <p>Engine: {nodeInfo.engine} v{nodeInfo.engineVersion}</p>
                    <p>API: v{nodeInfo.version}</p>
                    <p>Queue: {nodeInfo.taskQueueCount} tasks</p>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {nodeInfo && (
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            <span>
              {nodeInfo.engine} v{nodeInfo.engineVersion}
            </span>
            {nodeInfo.taskQueueCount > 0 && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                {nodeInfo.taskQueueCount} in queue
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={toggleTheme}
              >
                {isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onSettingsClick}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
}


'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Palette,
  Sun,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PointCloudViewerProps {
  url?: string; // URL to EPT/Potree point cloud
  taskId?: string;
  baseUrl?: string;
  className?: string;
}

// Point cloud color modes
const colorModes = [
  { id: 'rgb', name: 'RGB', icon: Palette },
  { id: 'elevation', name: 'Elevation', icon: Sun },
  { id: 'intensity', name: 'Intensity', icon: Eye },
];

export function PointCloudViewer({
  url,
  taskId,
  baseUrl = 'http://localhost:3000',
  className,
}: PointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointCount, setPointCount] = useState<number | null>(null);
  const [colorMode, setColorMode] = useState('rgb');

  // Construct point cloud URL if taskId is provided
  const pointCloudUrl = url || (taskId ? `${baseUrl}/task/${taskId}/download/entwine_pointcloud` : null);

  // Initialize Three.js viewer
  useEffect(() => {
    if (!containerRef.current || !pointCloudUrl) return;

    setIsLoading(true);
    setError(null);

    // Dynamic import of Potree viewer
    // Note: In production, you'd want to use a proper Potree/Three.js setup
    // This is a placeholder that shows the structure
    const initViewer = async () => {
      try {
        // For now, we'll create a simple placeholder
        // In a real implementation, you'd load Potree here
        
        // Simulate loading
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        // Check if point cloud exists
        const response = await fetch(pointCloudUrl, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error('Point cloud not available');
        }

        setIsLoading(false);
        setPointCount(null); // Would be set from actual point cloud metadata
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load point cloud');
        setIsLoading(false);
      }
    };

    initViewer();

    return () => {
      // Cleanup Three.js resources
    };
  }, [pointCloudUrl]);

  const handleReset = useCallback(() => {
    // Reset camera position
  }, []);

  const handleZoomIn = useCallback(() => {
    // Zoom in
  }, []);

  const handleZoomOut = useCallback(() => {
    // Zoom out
  }, []);

  const handleFitToView = useCallback(() => {
    // Fit point cloud to view
  }, []);

  const handleDownload = useCallback(() => {
    if (pointCloudUrl) {
      window.open(pointCloudUrl, '_blank');
    }
  }, [pointCloudUrl]);

  if (!pointCloudUrl) {
    return (
      <Card className={cn('h-full flex flex-col', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Box className="h-5 w-5" />
            Point Cloud Viewer
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Box className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No point cloud selected</p>
            <p className="text-xs mt-1">
              Complete a task to view its point cloud
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Box className="h-5 w-5" />
            Point Cloud Viewer
            {pointCount && (
              <Badge variant="secondary" className="ml-2">
                {(pointCount / 1000000).toFixed(1)}M points
              </Badge>
            )}
          </CardTitle>
          <TooltipProvider>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Palette className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {colorModes.map((mode) => (
                    <DropdownMenuItem
                      key={mode.id}
                      onClick={() => setColorMode(mode.id)}
                      className={cn(colorMode === mode.id && 'bg-accent')}
                    >
                      <mode.icon className="h-4 w-4 mr-2" />
                      {mode.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleReset}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleFitToView}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fit to view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleZoomIn}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleZoomOut}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleDownload}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download point cloud</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading point cloud...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center text-destructive">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-800"
        >
          {/* Three.js/Potree canvas will be rendered here */}
          {!isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Box className="h-16 w-16 mx-auto mb-4 opacity-50 animate-pulse" />
                <p className="text-sm">Point cloud viewer ready</p>
                <p className="text-xs mt-1 text-muted-foreground/70">
                  Use mouse to rotate, scroll to zoom
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Controls overlay */}
        <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 text-xs border shadow-lg">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">LMB</kbd>
              <span>Rotate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">RMB</kbd>
              <span>Pan</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Scroll</kbd>
              <span>Zoom</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


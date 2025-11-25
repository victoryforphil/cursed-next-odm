'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Download,
  Loader2,
  AlertCircle,
  Move,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface OrthomosaicViewerProps {
  url?: string;
  taskId?: string;
  baseUrl?: string;
  className?: string;
}

export function OrthomosaicViewer({
  url,
  taskId,
  baseUrl = 'http://localhost:3001',
  className,
}: OrthomosaicViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading orthomosaic...');
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // Retry state - changing this will re-trigger the load effect
  const [retryCount, setRetryCount] = useState(0);
  
  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
  }, []);

  // Load orthomosaic image via our proxy API
  useEffect(() => {
    if (!taskId && !url) return;

    let cancelled = false;

    const doLoad = async () => {
      setIsLoading(true);
      setError(null);
      setLoadedUrl(null);
      setLoadingMessage('Loading orthomosaic...');

      try {
        let imageUrl: string;

        if (url) {
          // Direct URL provided
          imageUrl = url;
        } else if (taskId) {
          // Use our proxy API that extracts from all.zip
          imageUrl = `/api/orthomosaic/${taskId}`;
          setLoadingMessage('Extracting orthomosaic from task results...');
        } else {
          return;
        }

        console.log(`[OrthomosaicViewer] Loading from: ${imageUrl}`);

        // Load the image
        const img = new Image();
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Image load timeout - the orthomosaic may be very large'));
          }, 120000); // 2 minute timeout for large images

          img.onload = () => {
            clearTimeout(timeout);
            if (cancelled) return resolve();
            
            setImageSize({ width: img.width, height: img.height });
            setLoadedUrl(imageUrl);
            
            if (imageRef.current) {
              imageRef.current.src = imageUrl;
            }
            
            // Center image initially
            if (containerRef.current) {
              const container = containerRef.current;
              const containerRect = container.getBoundingClientRect();
              const initialScale = Math.min(
                containerRect.width / img.width,
                containerRect.height / img.height,
                1
              );
              setScale(initialScale);
              setPosition({
                x: (containerRect.width - img.width * initialScale) / 2,
                y: (containerRect.height - img.height * initialScale) / 2,
              });
            }
            resolve();
          };

          img.onerror = async () => {
            clearTimeout(timeout);
            
            // If using our API, try to get the error message
            if (taskId && !url) {
              try {
                const response = await fetch(`/api/orthomosaic/${taskId}`);
                if (!response.ok) {
                  const data = await response.json();
                  reject(new Error(data.error || `Failed to load orthomosaic: ${response.status}`));
                  return;
                }
              } catch {
                // Ignore fetch error, use generic message
              }
            }
            reject(new Error('Failed to load orthomosaic image'));
          };

          img.src = imageUrl;
        });

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[OrthomosaicViewer] Error:', err);
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setError(message);
          setIsLoading(false);
        }
      }
    };

    doLoad();

    return () => {
      cancelled = true;
    };
    // retryCount is included to allow forced refresh
  }, [taskId, url, retryCount]);

  // Mouse drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.2, 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.2, 0.05));
  }, []);

  const handleReset = useCallback(() => {
    if (containerRef.current && imageRef.current && imageSize.width > 0) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const initialScale = Math.min(
        containerRect.width / imageSize.width,
        containerRect.height / imageSize.height,
        1
      );
      setScale(initialScale);
      setPosition({
        x: (containerRect.width - imageSize.width * initialScale) / 2,
        y: (containerRect.height - imageSize.height * initialScale) / 2,
      });
    }
  }, [imageSize]);

  const handleFitToView = useCallback(() => {
    handleReset();
  }, [handleReset]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.max(0.05, Math.min(10, prev * delta)));
  }, []);

  const handleDownload = useCallback(() => {
    if (taskId) {
      // Download all.zip which contains the full resolution orthomosaic
      window.open(`${baseUrl}/task/${taskId}/download/all.zip`, '_blank');
    } else if (loadedUrl) {
      window.open(loadedUrl, '_blank');
    }
  }, [loadedUrl, taskId, baseUrl]);

  if (!taskId && !url) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center bg-card', className)}>
        <div className="text-center text-muted-foreground">
          <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-sm">No orthomosaic available</p>
          <p className="text-xs mt-1">
            Complete a task to view its orthomosaic
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-card', className)}>
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          <h3 className="text-sm font-bold uppercase tracking-wider">Orthomosaic</h3>
          {imageSize.width > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {imageSize.width} × {imageSize.height}
            </Badge>
          )}
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleReset}
                  disabled={!loadedUrl}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleFitToView}
                  disabled={!loadedUrl}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomIn}
                  disabled={!loadedUrl}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomOut}
                  disabled={!loadedUrl}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleDownload}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download all results (ZIP)</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-black cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{loadingMessage}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                This may take a moment for large orthomosaics...
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 p-4">
            <div className="text-center max-w-md">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
              <p className="text-sm text-destructive font-medium mb-2">Failed to load orthomosaic</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono mb-4">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !error && loadedUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={imageRef}
            src={loadedUrl}
            alt="Orthomosaic"
            className="absolute select-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'top left',
              maxWidth: 'none',
            }}
            draggable={false}
          />
        )}

        {/* Zoom indicator */}
        {!isLoading && !error && loadedUrl && (
          <div className="absolute bottom-4 left-4 bg-black/80 border border-border px-3 py-2 z-10">
            <div className="text-[10px] uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Move className="h-3 w-3" />
                <span>Drag to pan</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span>Zoom: {Math.round(scale * 100)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


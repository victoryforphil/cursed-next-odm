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
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // Try multiple orthomosaic formats
  // NodeODM stores orthophotos at: odm_orthophoto/odm_orthophoto.{tif,png}
  // Browsers can display PNG but not GeoTIFF, so PNG is prioritized
  // The API endpoint is /task/{uuid}/download/{path}
  const orthoFormats = [
    'odm_orthophoto/odm_orthophoto.png',  // Browser-friendly PNG version
    'odm_orthophoto/odm_orthophoto.tif',  // GeoTIFF (won't display in browser but can be downloaded)
  ];

  // Load orthomosaic image - try multiple formats
  useEffect(() => {
    if (!taskId && !url) return;

    setIsLoading(true);
    setError(null);
    setLoadedUrl(null);

    const tryLoadImage = async (imageUrl: string): Promise<boolean> => {
      // First check if the file exists using HEAD request
      try {
        console.log(`[OrthomosaicViewer] Trying to load: ${imageUrl}`);
        const headResponse = await fetch(imageUrl, { method: 'HEAD' });
        if (!headResponse.ok) {
          console.log(`[OrthomosaicViewer] HEAD request failed for ${imageUrl}: ${headResponse.status}`);
          return false;
        }
        
        // Check content type - we can only display images in browser
        const contentType = headResponse.headers.get('content-type');
        console.log(`[OrthomosaicViewer] Content-Type: ${contentType}`);
        
        // GeoTIFF files can't be displayed directly in browser
        if (contentType?.includes('tiff') || contentType?.includes('tif')) {
          console.log(`[OrthomosaicViewer] File is TIFF format - browsers cannot display this directly`);
          // Continue to try loading it, but it might fail
        }
      } catch (err) {
        console.log(`[OrthomosaicViewer] HEAD request error for ${imageUrl}:`, err);
        return false;
      }

      return new Promise((resolve) => {
        const img = new Image();
        let resolved = false;
        
        // Set timeout to avoid hanging
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }, 5000);
        
        img.onload = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          
          setImageSize({ width: img.width, height: img.height });
          setIsLoading(false);
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
          resolve(true);
        };

        img.onerror = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        };

        img.src = imageUrl;
      });
    };

    const loadOrthomosaic = async () => {
      if (url) {
        // Direct URL provided
        const success = await tryLoadImage(url);
        if (!success) {
          setError('Failed to load orthomosaic from provided URL');
          setIsLoading(false);
        }
      } else if (taskId) {
        // Try each format
        for (const format of orthoFormats) {
          const imageUrl = `${baseUrl}/task/${taskId}/download/${format}`;
          const success = await tryLoadImage(imageUrl);
          if (success) {
            return; // Successfully loaded
          }
        }
        // If we get here, none of the formats worked
        setError(
          `Orthomosaic not found.\n\n` +
          `Tried paths:\n${orthoFormats.map(f => `  • ${baseUrl}/task/${taskId}/download/${f}`).join('\n')}\n\n` +
          `Common issues:\n` +
          `• Task may still be processing (check if status is COMPLETED)\n` +
          `• Orthophoto generation might have been skipped\n` +
          `• CORS may be blocking the request (check browser console)\n` +
          `• NodeODM server might not be running at ${baseUrl}`
        );
        setIsLoading(false);
      }
    };

    loadOrthomosaic();
  }, [taskId, url, baseUrl]);

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
    setScale((prev) => Math.min(prev * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.2, 0.1));
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
    setScale((prev) => Math.max(0.1, Math.min(5, prev * delta)));
  }, []);

  const handleDownload = useCallback(() => {
    if (loadedUrl) {
      window.open(loadedUrl, '_blank');
    } else if (taskId) {
      // Try to download the first format
      window.open(`${baseUrl}/task/${taskId}/download/orthomosaic.tif`, '_blank');
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
              <TooltipContent>Download orthomosaic</TooltipContent>
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
              <p className="text-sm text-muted-foreground">Loading orthomosaic...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 p-4">
            <div className="text-center text-destructive max-w-md">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-xs whitespace-pre-wrap font-mono">{error}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && loadedUrl && (
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
        {!isLoading && !error && (
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


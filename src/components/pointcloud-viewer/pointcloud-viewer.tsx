'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Box,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Palette,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileDown,
  Minus,
  Plus,
  Grid3X3,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PointCloudViewerProps {
  url?: string;
  taskId?: string;
  baseUrl?: string;
  className?: string;
}

interface PointCloudInfo {
  available: boolean;
  filename?: string;
  format?: string;
  size?: number;
  sizeFormatted?: string;
  error?: string;
}

// Color modes for point cloud rendering
type ColorMode = 'rgb' | 'elevation' | 'intensity';

const colorModes: { id: ColorMode; name: string; description: string }[] = [
  { id: 'rgb', name: 'RGB', description: 'Original colors' },
  { id: 'elevation', name: 'Elevation', description: 'Color by height' },
  { id: 'intensity', name: 'Intensity', description: 'Grayscale intensity' },
];

export function PointCloudViewer({
  url,
  taskId,
  baseUrl = 'http://localhost:3001',
  className,
}: PointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointCloudRef = useRef<THREE.Points | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const initialCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pointCloudInfo, setPointCloudInfo] = useState<PointCloudInfo | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('rgb');
  const [pointSize, setPointSize] = useState(2);
  const [pointCount, setPointCount] = useState<number>(0);
  const [showGrid, setShowGrid] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Store original colors and positions for color mode switching
  const originalColorsRef = useRef<Float32Array | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!containerRef.current || !canvasRef.current) return;

    // Clean up existing scene
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }

    const container = containerRef.current;
    const canvas = canvasRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 5000;
    controls.maxPolarAngle = Math.PI;
    controlsRef.current = controls;

    // Lighting (for potential future use with shaded points)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x333333);
    gridHelper.name = 'grid';
    gridHelper.visible = showGrid;
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(20);
    axesHelper.name = 'axes';
    scene.add(axesHelper);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      renderer.dispose();
      controls.dispose();
    };
  }, [showGrid]);

  // Load point cloud data
  const loadPointCloud = useCallback(async () => {
    if (!taskId || !sceneRef.current) return;

    setIsLoading(true);
    setLoadingProgress(0);
    setError(null);

    try {
      // Fetch binary point data
      console.log('[PointCloud Viewer] Fetching points data...');
      setLoadingProgress(10);
      
      const response = await fetch(`/api/pointcloud/${taskId}?format=points&maxPoints=1000000`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load point cloud' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      setLoadingProgress(40);

      const arrayBuffer = await response.arrayBuffer();
      const dataView = new DataView(arrayBuffer);
      
      // Parse binary format: [pointCount (4 bytes)] + [positions] + [colors]
      const numPoints = dataView.getUint32(0, true);
      console.log(`[PointCloud Viewer] Received ${numPoints.toLocaleString()} points`);
      
      setPointCount(numPoints);
      setLoadingProgress(60);

      const headerSize = 4;
      const positionsSize = numPoints * 3 * 4; // 3 floats per point
      const colorsSize = numPoints * 3; // 3 bytes per point

      // Extract positions
      const positions = new Float32Array(arrayBuffer, headerSize, numPoints * 3);
      
      // Extract colors (Uint8Array -> Float32Array normalized to 0-1)
      const colorsUint8 = new Uint8Array(arrayBuffer, headerSize + positionsSize, colorsSize);
      const colors = new Float32Array(numPoints * 3);
      for (let i = 0; i < colorsSize; i++) {
        colors[i] = colorsUint8[i] / 255;
      }

      // Store for color mode switching
      positionsRef.current = positions;
      originalColorsRef.current = colors.slice();

      setLoadingProgress(80);

      // Create point cloud geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      // Compute bounding box for camera positioning
      geometry.computeBoundingBox();
      const boundingBox = geometry.boundingBox!;
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);
      const size = new THREE.Vector3();
      boundingBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);

      // Create material
      const material = new THREE.PointsMaterial({
        size: pointSize,
        vertexColors: true,
        sizeAttenuation: true,
      });

      // Create points object
      const points = new THREE.Points(geometry, material);
      
      // Remove old point cloud if exists
      if (pointCloudRef.current) {
        sceneRef.current.remove(pointCloudRef.current);
        pointCloudRef.current.geometry.dispose();
        (pointCloudRef.current.material as THREE.Material).dispose();
      }

      sceneRef.current.add(points);
      pointCloudRef.current = points;

      // Position camera to see the point cloud
      const camera = cameraRef.current!;
      const controls = controlsRef.current!;
      
      const distance = maxDim * 1.5;
      camera.position.set(
        center.x + distance * 0.5,
        center.y + distance * 0.7,
        center.z + distance * 0.5
      );
      controls.target.copy(center);
      controls.update();

      // Store initial camera position for reset
      initialCameraRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };

      // Update grid to match point cloud scale
      const grid = sceneRef.current.getObjectByName('grid') as THREE.GridHelper;
      if (grid) {
        sceneRef.current.remove(grid);
        const newGrid = new THREE.GridHelper(maxDim * 2, 50, 0x444444, 0x333333);
        newGrid.name = 'grid';
        newGrid.position.y = boundingBox.min.y;
        newGrid.visible = showGrid;
        sceneRef.current.add(newGrid);
      }

      setLoadingProgress(100);
      setIsLoading(false);
      console.log('[PointCloud Viewer] Point cloud loaded successfully');
      
    } catch (err) {
      console.error('[PointCloud Viewer] Error loading point cloud:', err);
      setError(err instanceof Error ? err.message : 'Failed to load point cloud');
      setIsLoading(false);
    }
  }, [taskId, pointSize, showGrid]);

  // Check point cloud availability
  useEffect(() => {
    if (!taskId && !url) return;

    let cancelled = false;

    const checkAvailability = async () => {
      try {
        if (taskId) {
          const response = await fetch(`/api/pointcloud/${taskId}?info=true`);
          const data = await response.json();
          
          if (!cancelled) {
            if (data.available) {
              setPointCloudInfo(data);
            } else {
              throw new Error(data.error || 'Point cloud not available');
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to check point cloud';
          setError(message);
        }
      }
    };

    checkAvailability();

    return () => {
      cancelled = true;
    };
  }, [taskId, url]);

  // Initialize scene and load point cloud
  useEffect(() => {
    if (!pointCloudInfo?.available) return;

    const cleanup = initScene();
    
    // Load point cloud after scene is ready
    const timer = setTimeout(() => {
      loadPointCloud();
    }, 100);

    return () => {
      cleanup?.();
      clearTimeout(timer);
    };
  }, [pointCloudInfo?.available, initScene, loadPointCloud]);

  // Update point size
  useEffect(() => {
    if (pointCloudRef.current) {
      (pointCloudRef.current.material as THREE.PointsMaterial).size = pointSize;
    }
  }, [pointSize]);

  // Update grid visibility
  useEffect(() => {
    if (sceneRef.current) {
      const grid = sceneRef.current.getObjectByName('grid');
      if (grid) {
        grid.visible = showGrid;
      }
    }
  }, [showGrid]);

  // Update colors based on color mode
  useEffect(() => {
    if (!pointCloudRef.current || !originalColorsRef.current || !positionsRef.current) return;

    const geometry = pointCloudRef.current.geometry;
    const positions = positionsRef.current;
    const numPoints = positions.length / 3;
    
    let colors: Float32Array;

    if (colorMode === 'rgb') {
      colors = originalColorsRef.current.slice();
    } else if (colorMode === 'elevation') {
      // Color by Y (elevation)
      colors = new Float32Array(numPoints * 3);
      let minY = Infinity, maxY = -Infinity;
      
      for (let i = 0; i < numPoints; i++) {
        const y = positions[i * 3 + 1];
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      
      const range = maxY - minY || 1;
      
      for (let i = 0; i < numPoints; i++) {
        const y = positions[i * 3 + 1];
        const t = (y - minY) / range;
        
        // Blue -> Cyan -> Green -> Yellow -> Red gradient
        if (t < 0.25) {
          const s = t / 0.25;
          colors[i * 3] = 0;
          colors[i * 3 + 1] = s;
          colors[i * 3 + 2] = 1;
        } else if (t < 0.5) {
          const s = (t - 0.25) / 0.25;
          colors[i * 3] = 0;
          colors[i * 3 + 1] = 1;
          colors[i * 3 + 2] = 1 - s;
        } else if (t < 0.75) {
          const s = (t - 0.5) / 0.25;
          colors[i * 3] = s;
          colors[i * 3 + 1] = 1;
          colors[i * 3 + 2] = 0;
        } else {
          const s = (t - 0.75) / 0.25;
          colors[i * 3] = 1;
          colors[i * 3 + 1] = 1 - s;
          colors[i * 3 + 2] = 0;
        }
      }
    } else {
      // Intensity - grayscale based on original color luminance
      colors = new Float32Array(numPoints * 3);
      const original = originalColorsRef.current;
      
      for (let i = 0; i < numPoints; i++) {
        const r = original[i * 3];
        const g = original[i * 3 + 1];
        const b = original[i * 3 + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        colors[i * 3] = luminance;
        colors[i * 3 + 1] = luminance;
        colors[i * 3 + 2] = luminance;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.attributes.color.needsUpdate = true;
  }, [colorMode]);

  // Control handlers
  const handleReset = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current || !initialCameraRef.current) return;
    
    cameraRef.current.position.copy(initialCameraRef.current.position);
    controlsRef.current.target.copy(initialCameraRef.current.target);
    controlsRef.current.update();
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    
    const direction = new THREE.Vector3();
    direction.subVectors(controlsRef.current.target, cameraRef.current.position);
    cameraRef.current.position.add(direction.multiplyScalar(0.2));
    controlsRef.current.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    
    const direction = new THREE.Vector3();
    direction.subVectors(controlsRef.current.target, cameraRef.current.position);
    cameraRef.current.position.sub(direction.multiplyScalar(0.25));
    controlsRef.current.update();
  }, []);

  const handleFitToView = useCallback(() => {
    if (!pointCloudRef.current || !cameraRef.current || !controlsRef.current) return;
    
    const geometry = pointCloudRef.current.geometry;
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox!;
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    const distance = maxDim * 1.5;
    cameraRef.current.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.7,
      center.z + distance * 0.5
    );
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  }, []);

  const handleDownload = useCallback(async () => {
    if (!taskId) return;
    
    setIsDownloading(true);
    window.open(`/api/pointcloud/${taskId}`, '_blank');
    setTimeout(() => setIsDownloading(false), 2000);
  }, [taskId]);

  const handleDownloadAllZip = useCallback(() => {
    if (taskId) {
      window.open(`${baseUrl}/task/${taskId}/download/all.zip`, '_blank');
    }
  }, [taskId, baseUrl]);

  const handleRetry = useCallback(() => {
    setPointCloudInfo(null);
    setError(null);
    setPointCount(0);
  }, []);

  // No task ID
  if (!taskId && !url) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center bg-card', className)}>
        <div className="text-center text-muted-foreground">
          <Box className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-sm">No point cloud available</p>
          <p className="text-xs mt-1">Complete a task to view its point cloud</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-card', className)}>
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4" />
          <span className="font-medium text-sm">Point Cloud</span>
          {pointCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {pointCount.toLocaleString()} points
            </Badge>
          )}
          {pointCloudInfo?.format && (
            <Badge variant="outline" className="text-xs uppercase">
              {pointCloudInfo.format}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider>
            {/* Point size controls */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPointSize(Math.max(0.5, pointSize - 0.5))}
                  disabled={isLoading || !!error}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Decrease point size</TooltipContent>
            </Tooltip>

            <span className="text-xs text-muted-foreground w-8 text-center">
              {pointSize.toFixed(1)}
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPointSize(Math.min(10, pointSize + 0.5))}
                  disabled={isLoading || !!error}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Increase point size</TooltipContent>
            </Tooltip>

            {/* Separator */}
            <div className="w-px h-4 bg-border mx-1" />

            {/* Color mode */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isLoading || !!error || pointCount === 0}
                    >
                      <Palette className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Color mode</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                {colorModes.map((mode) => (
                  <DropdownMenuItem
                    key={mode.id}
                    onClick={() => setColorMode(mode.id)}
                    className={cn(colorMode === mode.id && 'bg-accent')}
                  >
                    <span className="flex-1">{mode.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {mode.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Grid toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showGrid ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowGrid(!showGrid)}
                  disabled={isLoading || !!error}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle grid</TooltipContent>
            </Tooltip>

            {/* Separator */}
            <div className="w-px h-4 bg-border mx-1" />

            {/* Camera controls */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleReset}
                  disabled={isLoading || !!error || pointCount === 0}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset camera</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleZoomIn}
                  disabled={isLoading || !!error || pointCount === 0}
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
                  disabled={isLoading || !!error || pointCount === 0}
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
                  onClick={handleFitToView}
                  disabled={isLoading || !!error || pointCount === 0}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to view</TooltipContent>
            </Tooltip>

            {/* Separator */}
            <div className="w-px h-4 bg-border mx-1" />

            {/* Download */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isDownloading || !pointCloudInfo?.available}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Download</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownload}>
                  <FileDown className="h-4 w-4 mr-2" />
                  <span>Download LAZ/LAS</span>
                  {pointCloudInfo?.sizeFormatted && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({pointCloudInfo.sizeFormatted})
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadAllZip}>
                  <FileDown className="h-4 w-4 mr-2" />
                  <span>Download all.zip</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        </div>
      </div>

      {/* Viewer */}
      <div ref={containerRef} className="flex-1 relative">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Loading point cloud...</p>
            <div className="w-48 h-2 bg-muted rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{loadingProgress}%</p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-sm text-destructive mb-2">Failed to load point cloud</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-md text-center">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {/* Controls hint */}
        {pointCount > 0 && !isLoading && !error && (
          <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
            Left click: Rotate • Right click: Pan • Scroll: Zoom
          </div>
        )}
      </div>
    </div>
  );
}


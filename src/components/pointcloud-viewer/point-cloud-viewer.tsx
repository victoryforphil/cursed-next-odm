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
  Eye,
  Move3D,
  Axis3D,
  Home,
  Settings2,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PointCloudViewerProps {
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

type ColorMode = 'rgb' | 'elevation';

const colorModes: { id: ColorMode; name: string; description: string }[] = [
  { id: 'rgb', name: 'RGB', description: 'Original colors' },
  { id: 'elevation', name: 'Elevation', description: 'Color by height' },
];

// Height gradient stops for elevation coloring (t in [0, 1])
const ELEVATION_STOPS: [number, number, number][] = [
  [40, 80, 200],   // blue (low)
  [34, 197, 94],   // green
  [250, 204, 21],  // yellow
  [239, 68, 68],   // red (high)
];

function elevationColorAt(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (ELEVATION_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), ELEVATION_STOPS.length - 2);
  const f = scaled - i;
  const a = ELEVATION_STOPS[i];
  const b = ELEVATION_STOPS[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

export function PointCloudViewer({
  taskId,
  baseUrl = 'http://localhost:3001',
  className,
}: PointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const boundingBoxRef = useRef<THREE.Box3 | null>(null);
  const initialCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const rgbColorsRef = useRef<Float32Array | null>(null);
  const animationIdRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pointCloudInfo, setPointCloudInfo] = useState<PointCloudInfo | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('rgb');
  const [pointSize, setPointSize] = useState(1);
  const [pointBudget, setPointBudget] = useState(2_000_000);
  const [pointCount, setPointCount] = useState<number>(0);
  const [showGrid, setShowGrid] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);

  const handleRetry = useCallback(() => {
    setError(null);
    setPointCount(0);
    setPointCloudInfo(null);
    setLoadVersion((v) => v + 1);
  }, []);

  // Initialize the three.js scene once per task
  useEffect(() => {
    const container = containerRef.current;
    if (!taskId || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1_000_000);
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 1_000_000;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    const grid = new THREE.GridHelper(200, 50, 0x444444, 0x333333);
    grid.name = 'grid';
    grid.visible = showGrid;
    scene.add(grid);
    gridRef.current = grid;

    const axesHelper = new THREE.AxesHelper(20);
    scene.add(axesHelper);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      pointsRef.current = null;
      gridRef.current = null;
      boundingBoxRef.current = null;
      initialCameraRef.current = null;
    };
    // showGrid intentionally excluded: grid visibility is handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Load point cloud data (re-runs on retry or point budget change)
  useEffect(() => {
    if (!taskId) return;

    const abortController = new AbortController();
    const { signal } = abortController;

    const load = async () => {
      setIsLoading(true);
      setLoadingProgress(5);
      setLoadingMessage('Checking point cloud availability...');
      setError(null);
      setPointCount(0);

      try {
        const infoResponse = await fetch(`/api/pointcloud/${taskId}?info=true`, { signal });
        const info: PointCloudInfo = await infoResponse.json();

        if (!info.available) {
          throw new Error(info.error || 'Point cloud not available');
        }

        setPointCloudInfo(info);
        setLoadingProgress(15);
        setLoadingMessage('Loading point cloud data...');

        const pointsResponse = await fetch(
          `/api/pointcloud/${taskId}?format=points&maxPoints=${pointBudget}`,
          { signal },
        );

        if (!pointsResponse.ok) {
          const data = await pointsResponse.json().catch(() => null);
          throw new Error(data?.error || `Failed to load point cloud data (${pointsResponse.status})`);
        }

        const arrayBuffer = await pointsResponse.arrayBuffer();
        const dataView = new DataView(arrayBuffer);
        const numPoints = dataView.getUint32(0, true);

        setLoadingProgress(60);
        setLoadingMessage(`Building geometry (${numPoints.toLocaleString()} points)...`);

        // Binary layout: [pointCount: u32] [positions: f32 * 3N] [colors: u8 * 3N]
        const headerSize = 4;
        const positions = new Float32Array(arrayBuffer, headerSize, numPoints * 3);
        const colorsRaw = new Uint8Array(arrayBuffer, headerSize + numPoints * 12, numPoints * 3);

        const rgbColors = new Float32Array(numPoints * 3);
        for (let i = 0; i < numPoints * 3; i++) {
          rgbColors[i] = colorsRaw[i] / 255;
        }
        rgbColorsRef.current = rgbColors;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(rgbColors.slice(), 3));
        geometry.computeBoundingBox();

        const material = new THREE.PointsMaterial({
          size: pointSize,
          vertexColors: true,
          sizeAttenuation: true,
        });

        const points = new THREE.Points(geometry, material);

        const scene = sceneRef.current;
        if (!scene) throw new Error('Scene not initialized');

        // Replace any previously loaded points (e.g. after a point budget change)
        if (pointsRef.current) {
          scene.remove(pointsRef.current);
          pointsRef.current.geometry.dispose();
          (pointsRef.current.material as THREE.Material).dispose();
          pointsRef.current = null;
        }
        scene.add(points);
        pointsRef.current = points;

        const boundingBox = geometry.boundingBox ?? new THREE.Box3();
        boundingBoxRef.current = boundingBox;
        setPointCount(numPoints);

        // Resize the ground grid to the cloud extent
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        if (gridRef.current) {
          scene.remove(gridRef.current);
          gridRef.current.geometry.dispose();
          (gridRef.current.material as THREE.Material).dispose();
          const newGrid = new THREE.GridHelper(maxDim * 2, 50, 0x444444, 0x333333);
          newGrid.name = 'grid';
          newGrid.position.y = boundingBox.min.y;
          newGrid.visible = showGrid;
          scene.add(newGrid);
          gridRef.current = newGrid;
        }

        // Fit the camera on first load only — budget changes should keep the view
        if (!initialCameraRef.current && cameraRef.current && controlsRef.current) {
          const center = new THREE.Vector3();
          boundingBox.getCenter(center);
          const distance = maxDim * 1.5;
          cameraRef.current.position.set(
            center.x + distance * 0.5,
            center.y + distance * 0.7,
            center.z + distance * 0.5,
          );
          controlsRef.current.target.copy(center);
          controlsRef.current.update();
          initialCameraRef.current = {
            position: cameraRef.current.position.clone(),
            target: controlsRef.current.target.clone(),
          };
        }

        setLoadingProgress(100);
        setIsLoading(false);
        setLoadingMessage('');
      } catch (err) {
        if (signal.aborted) return;
        console.error('[PointCloudViewer] Error loading point cloud:', err);
        setError(err instanceof Error ? err.message : 'Failed to load point cloud');
        setIsLoading(false);
        setLoadingMessage('');
      }
    };

    load();

    return () => abortController.abort();
    // showGrid intentionally excluded: handled by grid visibility effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, pointBudget, loadVersion]);

  // Update point size
  useEffect(() => {
    if (pointsRef.current) {
      (pointsRef.current.material as THREE.PointsMaterial).size = pointSize;
    }
  }, [pointSize]);

  // Update grid visibility
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Apply color mode by rewriting the color attribute
  useEffect(() => {
    const points = pointsRef.current;
    if (!points || !rgbColorsRef.current) return;

    const geometry = points.geometry;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    if (colorMode === 'rgb') {
      (colorAttr.array as Float32Array).set(rgbColorsRef.current);
    } else {
      const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
      const boundingBox = boundingBoxRef.current;
      const minZ = boundingBox ? boundingBox.min.y : 0;
      const rangeZ = boundingBox ? Math.max(boundingBox.max.y - boundingBox.min.y, 1e-6) : 1;
      for (let i = 0; i < positions.count; i++) {
        const t = (positions.getY(i) - minZ) / rangeZ;
        const [r, g, b] = elevationColorAt(t);
        colorAttr.setXYZ(i, r / 255, g / 255, b / 255);
      }
    }
    colorAttr.needsUpdate = true;
  }, [colorMode, pointCount]);

  const fitCameraToBox = useCallback(() => {
    const boundingBox = boundingBoxRef.current;
    if (!boundingBox || !cameraRef.current || !controlsRef.current) return;

    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    const distance = maxDim * 1.5;
    cameraRef.current.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.7,
      center.z + distance * 0.5,
    );
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  }, []);

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
    fitCameraToBox();
  }, [fitCameraToBox]);

  const setCameraView = useCallback((view: 'top' | 'front' | 'side' | 'iso') => {
    const boundingBox = boundingBoxRef.current;
    if (!boundingBox || !cameraRef.current || !controlsRef.current) return;

    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5;

    switch (view) {
      case 'top':
        cameraRef.current.position.set(center.x, center.y + distance, center.z);
        break;
      case 'front':
        cameraRef.current.position.set(center.x, center.y, center.z + distance);
        break;
      case 'side':
        cameraRef.current.position.set(center.x + distance, center.y, center.z);
        break;
      case 'iso':
      default:
        cameraRef.current.position.set(
          center.x + distance * 0.5,
          center.y + distance * 0.7,
          center.z + distance * 0.5,
        );
        break;
    }

    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  }, []);

  const handleDownload = useCallback(() => {
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

  if (!taskId) {
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
                  onClick={() => setPointSize(Math.max(0.1, pointSize - 0.2))}
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
                  onClick={() => setPointSize(Math.min(5, pointSize + 0.2))}
                  disabled={isLoading || !!error}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Increase point size</TooltipContent>
            </Tooltip>

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

            {/* Settings */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isLoading || !!error}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-64">
                <div className="p-2">
                  <div className="text-xs font-medium mb-2">Point Budget</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={100000}
                      max={10000000}
                      step={100000}
                      value={pointBudget}
                      onChange={(e) => setPointBudget(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-xs w-16 text-right">
                      {(pointBudget / 1000000).toFixed(1)}M
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowGrid(!showGrid)}>
                  <Grid3X3 className="h-4 w-4 mr-2" />
                  <span className="flex-1">Show Grid</span>
                  {showGrid && <span className="text-xs">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
        {/* Left sidebar toolbar */}
        {pointCount > 0 && !isLoading && !error && (
          <div className="absolute top-4 left-4 flex flex-col gap-1 z-10">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/80 border border-border hover:bg-black"
                    onClick={() => setCameraView('iso')}
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Isometric view</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/80 border border-border hover:bg-black"
                    onClick={() => setCameraView('top')}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Top view</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/80 border border-border hover:bg-black"
                    onClick={() => setCameraView('front')}
                  >
                    <Move3D className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Front view</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/80 border border-border hover:bg-black"
                    onClick={() => setCameraView('side')}
                  >
                    <Axis3D className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Side view</TooltipContent>
              </Tooltip>

              <div className="h-px bg-border my-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/80 border border-border hover:bg-black"
                    onClick={handleFitToView}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Fit to view</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-sm text-muted-foreground mb-2">{loadingMessage || 'Loading point cloud...'}</p>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80">
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

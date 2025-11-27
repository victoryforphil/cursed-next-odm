'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import {
  Boxes,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sun,
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
import { cn } from '@/lib/utils';

interface MeshViewerProps {
  taskId?: string;
  baseUrl?: string;
  className?: string;
}

interface MeshInfo {
  available: boolean;
  filename?: string;
  size?: number;
  sizeFormatted?: string;
  format?: string;
  error?: string;
}

export function MeshViewer({
  taskId,
  baseUrl = 'http://localhost:3001',
  className,
}: MeshViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Object3D | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading mesh...');
  const [error, setError] = useState<string | null>(null);
  const [meshInfo, setMeshInfo] = useState<MeshInfo | null>(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [vertexCount, setVertexCount] = useState<number | null>(null);
  const [faceCount, setFaceCount] = useState<number | null>(null);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    // Clean up existing renderer
    if (rendererRef.current) {
      rendererRef.current.dispose();
      containerRef.current.removeChild(rendererRef.current.domElement);
    }

    const container = containerRef.current;
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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 1;
    controls.maxDistance = 5000;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-50, 50, -50);
    scene.add(directionalLight2);

    // Grid helper
    const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x333333);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Load mesh from API
  const loadMesh = useCallback(async () => {
    if (!taskId || !sceneRef.current) return;

    setIsLoading(true);
    setError(null);
    setLoadingMessage('Checking mesh availability...');

    try {
      // First check if mesh is available
      const infoResponse = await fetch(`/api/mesh/${taskId}?info=true`);
      const info = await infoResponse.json();

      if (!info.available) {
        throw new Error(info.error || 'Mesh not available');
      }

      setMeshInfo(info);
      setLoadingMessage(`Loading ${info.format?.toUpperCase()} mesh (${info.sizeFormatted})...`);

      // Load the mesh based on format
      const meshUrl = `/api/mesh/${taskId}`;
      
      if (info.format === 'obj') {
        // Try to load MTL first for textures
        let materials: MTLLoader.MaterialCreator | null = null;
        try {
          const mtlLoader = new MTLLoader();
          materials = await mtlLoader.loadAsync(`/api/mesh/${taskId}?type=mtl`);
          materials.preload();
          setLoadingMessage('Loading texture...');
          
          // Try to load texture
          try {
            const textureUrl = `/api/mesh/${taskId}?type=texture`;
            const textureResponse = await fetch(textureUrl, { method: 'HEAD' });
            if (textureResponse.ok) {
              // Texture is available, materials should reference it
            }
          } catch {
            // Texture not available, continue without
          }
        } catch {
          // MTL not available, continue without
        }

        const objLoader = new OBJLoader();
        if (materials) {
          objLoader.setMaterials(materials);
        }
        
        const object = await objLoader.loadAsync(meshUrl);
        addMeshToScene(object);
        
      } else if (info.format === 'ply') {
        const plyLoader = new PLYLoader();
        const geometry = await plyLoader.loadAsync(meshUrl);
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({
          color: 0x808080,
          flatShading: false,
          side: THREE.DoubleSide,
          vertexColors: geometry.hasAttribute('color'),
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        addMeshToScene(mesh);
        
      } else {
        throw new Error(`Unsupported mesh format: ${info.format}`);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('[MeshViewer] Error:', err);
      const message = err instanceof Error ? err.message : 'Failed to load mesh';
      setError(message);
      setIsLoading(false);
    }
  }, [taskId]);

  // Add mesh to scene and center camera
  const addMeshToScene = useCallback((object: THREE.Object3D) => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    // Remove existing mesh
    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current);
    }

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Center the object
    object.position.sub(center);
    
    // Apply default material if none exists
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.material || (child.material as THREE.Material).type === 'MeshBasicMaterial') {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            flatShading: false,
            side: THREE.DoubleSide,
          });
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    sceneRef.current.add(object);
    meshRef.current = object;

    // Count vertices and faces
    let verts = 0;
    let faces = 0;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const geo = child.geometry;
        if (geo.attributes.position) {
          verts += geo.attributes.position.count;
        }
        if (geo.index) {
          faces += geo.index.count / 3;
        } else if (geo.attributes.position) {
          faces += geo.attributes.position.count / 3;
        }
      }
    });
    setVertexCount(verts);
    setFaceCount(Math.round(faces));

    // Position camera to see the whole model
    const distance = maxDim * 2;
    cameraRef.current.position.set(distance, distance * 0.5, distance);
    cameraRef.current.lookAt(0, 0, 0);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, []);

  // Initialize scene on mount
  useEffect(() => {
    const cleanup = initScene();
    return cleanup;
  }, [initScene]);

  // Load mesh when taskId changes
  useEffect(() => {
    if (taskId && sceneRef.current) {
      loadMesh();
    }
  }, [taskId, loadMesh]);

  // Toggle wireframe
  const toggleWireframe = useCallback(() => {
    if (!meshRef.current) return;
    
    const newWireframe = !showWireframe;
    setShowWireframe(newWireframe);
    
    meshRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.wireframe = newWireframe;
      }
    });
  }, [showWireframe]);

  // Reset view
  const handleReset = useCallback(() => {
    if (!meshRef.current || !cameraRef.current || !controlsRef.current) return;
    
    const box = new THREE.Box3().setFromObject(meshRef.current);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;
    
    cameraRef.current.position.set(distance, distance * 0.5, distance);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const direction = new THREE.Vector3();
    cameraRef.current.getWorldDirection(direction);
    cameraRef.current.position.addScaledVector(direction, 10);
    controlsRef.current.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const direction = new THREE.Vector3();
    cameraRef.current.getWorldDirection(direction);
    cameraRef.current.position.addScaledVector(direction, -10);
    controlsRef.current.update();
  }, []);

  // Fit to view
  const handleFitToView = useCallback(() => {
    handleReset();
  }, [handleReset]);

  // Download
  const handleDownload = useCallback(() => {
    if (taskId) {
      window.open(`/api/mesh/${taskId}`, '_blank');
    }
  }, [taskId]);

  const handleDownloadAllZip = useCallback(() => {
    if (taskId) {
      window.open(`${baseUrl}/task/${taskId}/download/all.zip`, '_blank');
    }
  }, [taskId, baseUrl]);

  // Retry
  const handleRetry = useCallback(() => {
    loadMesh();
  }, [loadMesh]);

  if (!taskId) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center bg-card', className)}>
        <div className="text-center text-muted-foreground">
          <Boxes className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-sm">No mesh available</p>
          <p className="text-xs mt-1">
            Complete a task to view its 3D mesh
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-card', className)}>
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          <h3 className="text-sm font-bold uppercase tracking-wider">3D Mesh</h3>
          {meshInfo?.sizeFormatted && (
            <Badge variant="outline" className="text-[10px]">
              {meshInfo.format?.toUpperCase()} • {meshInfo.sizeFormatted}
            </Badge>
          )}
          {vertexCount && faceCount && (
            <Badge variant="secondary" className="text-[10px]">
              {(vertexCount / 1000).toFixed(1)}K verts • {(faceCount / 1000).toFixed(1)}K faces
            </Badge>
          )}
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showWireframe ? 'default' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleWireframe}
                  disabled={!meshRef.current}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle wireframe</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleReset}
                  disabled={!meshRef.current}
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
                  disabled={!meshRef.current}
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
                  disabled={!meshRef.current}
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
                  disabled={!meshRef.current}
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
                  disabled={!meshInfo?.available}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download mesh</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{loadingMessage}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 p-4">
            <div className="text-center max-w-md">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
              <p className="text-sm text-destructive font-medium mb-2">Failed to load mesh</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAllZip}
                  className="gap-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download ZIP
                </Button>
              </div>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="absolute inset-0"
        />

        {/* Controls help */}
        {!isLoading && !error && meshRef.current && (
          <div className="absolute bottom-4 left-4 bg-black/80 border border-border px-3 py-2 z-10">
            <div className="text-[10px] uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">LMB</kbd>
                <span>Rotate</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">RMB</kbd>
                <span>Pan</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Scroll</kbd>
                <span>Zoom</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Upload,
  FolderOpen,
  Image as ImageIcon,
  MapPin,
  Rocket,
  Search,
  Sliders,
  ChevronDown,
  ChevronRight,
  Info,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MapView } from '@/components/map-view';
import { FileBrowser } from '@/components/file-browser';
import type { ODMOption, TaskOption, ImageFile, UploadStatus } from '@/lib/types/nodeodm';

interface NewJobViewProps {
  odmOptions: ODMOption[];
  isConnected: boolean;
  onCreateTask: (files: File[], name: string, options: TaskOption[]) => Promise<string | null>;
  onTaskCreated: () => void;
}

// Presets
const presets = [
  { name: 'FAST', description: 'Quick scan', options: [{ name: 'fast-orthophoto', value: true }, { name: 'feature-quality', value: 'low' }] },
  { name: 'DEFAULT', description: 'Balanced', options: [] },
  { name: 'HIGH', description: 'Best quality', options: [{ name: 'feature-quality', value: 'ultra' }, { name: 'pc-quality', value: 'high' }] },
  { name: 'TERRAIN', description: 'DTM/DSM', options: [{ name: 'dsm', value: true }, { name: 'dtm', value: true }] },
];

// Option categories
const optionCategories: Record<string, string[]> = {
  'QUALITY': ['feature-quality', 'pc-quality', 'mesh-octree-depth', 'depthmap-resolution'],
  'OUTPUT': ['dsm', 'dtm', 'orthophoto-png', 'orthophoto-kmz', 'cog'],
  'PROCESSING': ['fast-orthophoto', 'skip-3dmodel', 'skip-report', 'pc-filter'],
  'CAMERA': ['camera-lens', 'radiometric-calibration'],
  'GEO': ['gps-accuracy', 'use-exif', 'boundary'],
};

function categorizeOption(name: string): string {
  for (const [category, options] of Object.entries(optionCategories)) {
    if (options.some(opt => name.includes(opt) || opt.includes(name))) {
      return category;
    }
  }
  return 'OTHER';
}

export function NewJobView({ odmOptions, isConnected, onCreateTask, onTaskCreated }: NewJobViewProps) {
  const [selectedFiles, setSelectedFiles] = useState<ImageFile[]>([]);
  const [selectedFileObjects, setSelectedFileObjects] = useState<Map<string, File>>(new Map());
  const [uploadStatus, setUploadStatus] = useState<Map<string, { status: UploadStatus; progress: number }>>(new Map());
  const [taskName, setTaskName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(1);
  const [customOptions, setCustomOptions] = useState<Map<string, string | number | boolean>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['QUALITY', 'OUTPUT']));
  const [isCreating, setIsCreating] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);

  // Group options
  const groupedOptions = useMemo(() => {
    const groups: Record<string, ODMOption[]> = {};
    const query = searchQuery.toLowerCase();

    odmOptions.forEach((option) => {
      if (query && !option.name.toLowerCase().includes(query) && !option.help.toLowerCase().includes(query)) {
        return;
      }
      const category = categorizeOption(option.name);
      if (!groups[category]) groups[category] = [];
      groups[category].push(option);
    });

    const order = ['QUALITY', 'OUTPUT', 'PROCESSING', 'CAMERA', 'GEO', 'OTHER'];
    return order.map(cat => [cat, groups[cat] || []] as [string, ODMOption[]]).filter(([, opts]) => opts.length > 0);
  }, [odmOptions, searchQuery]);

  const handlePresetSelect = useCallback((index: number) => {
    setSelectedPreset(index);
    const preset = presets[index];
    const newOptions = new Map<string, string | number | boolean>();
    preset.options.forEach((opt) => newOptions.set(opt.name, opt.value));
    setCustomOptions(newOptions);
  }, []);

  const handleOptionChange = useCallback((name: string, value: string | number | boolean) => {
    setCustomOptions((prev) => {
      const newMap = new Map(prev);
      if (value === '' || value === false) {
        newMap.delete(name);
      } else {
        newMap.set(name, value);
      }
      return newMap;
    });
    setSelectedPreset(-1);
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) newSet.delete(category);
      else newSet.add(category);
      return newSet;
    });
  }, []);

  const handleFilesWithDataSelected = useCallback((files: { imageFile: ImageFile; file: File }[]) => {
    const fileMap = new Map<string, File>();
    files.forEach(({ imageFile, file }) => {
      fileMap.set(imageFile.id, file);
    });
    setSelectedFileObjects(fileMap);
  }, []);

  const handleClearFiles = useCallback(() => {
    setSelectedFiles([]);
    setSelectedFileObjects(new Map());
  }, []);

  const handleCreate = useCallback(async () => {
    if (selectedFiles.length === 0 || !isConnected) return;
    
    // Get File objects in the same order as selectedFiles
    const files: File[] = [];
    const fileIdMap = new Map<File, string>(); // Map File to ImageFile id
    selectedFiles.forEach((imageFile) => {
      const file = selectedFileObjects.get(imageFile.id);
      if (file) {
        files.push(file);
        fileIdMap.set(file, imageFile.id);
      }
    });

    if (files.length === 0) {
      console.error('No file objects available for upload');
      return;
    }

    setIsCreating(true);
    setOverallProgress(0);
    
    // Initialize upload status for all files
    const initialStatus = new Map<string, { status: UploadStatus; progress: number }>();
    selectedFiles.forEach((imageFile) => {
      initialStatus.set(imageFile.id, { status: 'pending', progress: 0 });
    });
    setUploadStatus(initialStatus);

    try {
      const options: TaskOption[] = Array.from(customOptions.entries()).map(
        ([name, value]) => ({ name, value })
      );
      const name = taskName.trim() || `Task ${new Date().toLocaleString()}`;
      
      // Track upload progress
      const updateFileProgress = (fileId: string, progress: number, status: UploadStatus) => {
        setUploadStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(fileId, { status, progress });
          
          // Calculate overall progress
          let totalProgress = 0;
          newMap.forEach(({ progress: p }) => {
            totalProgress += p;
          });
          setOverallProgress((totalProgress / selectedFiles.length) || 0);
          
          return newMap;
        });
      };

      // Simulate per-file upload progress
      const uploadWithProgress = async () => {
        // Mark all as uploading
        selectedFiles.forEach((imageFile) => {
          updateFileProgress(imageFile.id, 0, 'uploading');
        });

        // Simulate chunked upload with progress
        const chunkSize = 5;
        for (let i = 0; i < files.length; i += chunkSize) {
          const chunk = files.slice(i, i + chunkSize);
          const chunkIds = chunk.map(f => fileIdMap.get(f)!);
          
          // Update progress for this chunk
          chunkIds.forEach((id) => {
            updateFileProgress(id, 50, 'uploading');
          });
          
          // Small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Mark all as uploaded
        selectedFiles.forEach((imageFile) => {
          updateFileProgress(imageFile.id, 100, 'uploaded');
        });
      };

      // Start upload progress simulation
      uploadWithProgress();
      
      const taskId = await onCreateTask(files, name, options);
      
      if (taskId) {
        // Mark all as uploaded
        selectedFiles.forEach((imageFile) => {
          updateFileProgress(imageFile.id, 100, 'uploaded');
        });
        setOverallProgress(100);
        
        // Clear status after a delay
        setTimeout(() => {
          setUploadStatus(new Map());
          setOverallProgress(0);
        }, 2000);
        
        onTaskCreated();
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      // Mark all as error
      selectedFiles.forEach((imageFile) => {
        setUploadStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(imageFile.id, { status: 'error', progress: 0 });
          return newMap;
        });
      });
    } finally {
      setIsCreating(false);
    }
  }, [selectedFiles, selectedFileObjects, taskName, customOptions, isConnected, onCreateTask, onTaskCreated]);

  // Memoize expensive calculations
  const gpsCount = useMemo(() => {
    return selectedFiles.filter(f => f.exif?.latitude !== undefined).length;
  }, [selectedFiles]);

  // Add upload status to files
  const filesWithUploadStatus = useMemo(() => {
    return selectedFiles.map(file => {
      const status = uploadStatus.get(file.id);
      return {
        ...file,
        uploadStatus: status?.status || 'pending',
        uploadProgress: status?.progress || 0,
      };
    });
  }, [selectedFiles, uploadStatus]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top: File Browser + Map (Horizontal) */}
      <ResizablePanelGroup direction="vertical" className="flex-1">
        <ResizablePanel defaultSize={60} minSize={30}>
          <ResizablePanelGroup direction="horizontal">
            {/* Left: File Browser */}
            <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
              <div className="h-full flex flex-col bg-card">
                <div className="p-4 border-b">
                  <h2 className="text-sm font-bold uppercase tracking-wider">Select Images</h2>
                  <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                    Drag & drop or browse files
                  </p>
                </div>
                <div className="flex-1 overflow-hidden p-4">
                  <FileBrowser
                    selectedFiles={filesWithUploadStatus}
                    setSelectedFiles={setSelectedFiles}
                    onFilesWithDataSelected={handleFilesWithDataSelected}
                  />
                </div>
                {selectedFiles.length > 0 && (
                  <div className="p-4 border-t bg-accent/50">
                    <div className="flex items-center justify-between text-xs uppercase tracking-wider">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="h-3 w-3" />
                          {selectedFiles.length}
                        </span>
                        <span className="flex items-center gap-1.5 text-[#00ff88]">
                          <MapPin className="h-3 w-3" />
                          {gpsCount} GPS
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs uppercase"
                        onClick={handleClearFiles}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right: Map */}
            <ResizablePanel defaultSize={65} minSize={50}>
              <div className="h-full flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-card">
                  <h2 className="text-sm font-bold uppercase tracking-wider">Image Locations</h2>
                  <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                    {gpsCount > 0 ? `${gpsCount} images with coordinates` : 'No GPS data available'}
                  </p>
                </div>
                <div className="flex-1 relative min-h-0">
                  <MapView images={filesWithUploadStatus} className="absolute inset-0" />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Bottom: Configuration Panel */}
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="h-full flex flex-col bg-card">
        <div className="p-4 border-b">
          <h2 className="text-sm font-bold uppercase tracking-wider">Job Configuration</h2>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
            Processing options
          </p>
        </div>

        {/* Upload Progress */}
        {isCreating && overallProgress > 0 && (
          <div className="px-4 py-3 border-b bg-accent/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Uploading Images</span>
              <span className="text-xs text-muted-foreground">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-1.5" />
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-[#00ccff] animate-pulse" />
                {Array.from(uploadStatus.values()).filter(s => s.status === 'uploading').length} uploading
              </span>
              <span className="flex items-center gap-1.5 text-[#00ff88]">
                <div className="w-1.5 h-1.5 bg-[#00ff88]" />
                {Array.from(uploadStatus.values()).filter(s => s.status === 'uploaded').length} uploaded
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Job Name and Preset - Inline */}
            <div className="flex items-end gap-4">
              {/* Job Name */}
              <div className="flex-1 space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider">Job Name</label>
                <Input
                  placeholder="Enter job name..."
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  className="h-10 bg-input border-border"
                />
              </div>

              {/* Presets */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider">Preset</label>
                <div className="grid grid-cols-4 gap-2">
                  {presets.map((preset, index) => (
                    <button
                      key={preset.name}
                      onClick={() => handlePresetSelect(index)}
                      className={cn(
                        'p-2 border text-center transition-all',
                        'hover:border-white hover:bg-accent',
                        selectedPreset === index 
                          ? 'border-white bg-white text-black' 
                          : 'border-border bg-transparent'
                      )}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider">{preset.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Separator className="bg-border" />

            {/* Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="h-3 w-3" />
                  Options
                </label>
                {customOptions.size > 0 && (
                  <Badge variant="outline" className="text-[10px] border-[#00ff88] text-[#00ff88]">
                    {customOptions.size} Modified
                  </Badge>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search options..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-input border-border"
                />
              </div>

              {/* Categories */}
              <TooltipProvider delayDuration={300}>
                <div className="space-y-1">
                  {groupedOptions.map(([category, options]) => (
                    <div key={category} className="border border-border">
                      <button
                        onClick={() => toggleCategory(category)}
                        className={cn(
                          'w-full flex items-center justify-between p-2 text-xs font-bold uppercase tracking-wider',
                          'hover:bg-accent transition-colors',
                          expandedCategories.has(category) && 'bg-accent'
                        )}
                      >
                        <span>{category}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-normal">{options.length}</span>
                          {expandedCategories.has(category) ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </div>
                      </button>
                      
                      {expandedCategories.has(category) && (
                        <div className="border-t border-border">
                          {options.map((option) => (
                            <div
                              key={option.name}
                              className={cn(
                                'flex items-start gap-2 p-2 border-b border-border last:border-b-0',
                                'hover:bg-accent/50 transition-colors',
                                customOptions.has(option.name) && 'bg-[#00ff88]/5'
                              )}
                            >
                              {option.type === 'bool' ? (
                                <Checkbox
                                  id={option.name}
                                  checked={customOptions.get(option.name) === true}
                                  onCheckedChange={(checked) => handleOptionChange(option.name, !!checked)}
                                  className="mt-0.5 border-border data-[state=checked]:bg-white data-[state=checked]:text-black"
                                />
                              ) : (
                                <Input
                                  type={option.type === 'int' || option.type === 'float' ? 'number' : 'text'}
                                  placeholder={option.value}
                                  value={customOptions.get(option.name)?.toString() ?? ''}
                                  onChange={(e) => handleOptionChange(
                                    option.name,
                                    option.type === 'int' ? parseInt(e.target.value) || '' :
                                    option.type === 'float' ? parseFloat(e.target.value) || '' :
                                    e.target.value
                                  )}
                                  className="w-16 h-6 text-[10px] bg-input border-border"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <label htmlFor={option.name} className="text-xs font-medium cursor-pointer">
                                    {option.name}
                                  </label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-xs bg-popover border-border">
                                      <p className="text-xs">{option.help}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  Default: {option.value || 'none'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-accent/50">
          <Button
            className={cn(
              'w-full h-12 text-sm font-bold uppercase tracking-wider',
              'bg-white text-black hover:bg-gray-200',
              'disabled:bg-muted disabled:text-muted-foreground'
            )}
            onClick={handleCreate}
            disabled={selectedFiles.length === 0 || !isConnected || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Start Processing
              </>
            )}
          </Button>
          {!isConnected && (
            <p className="text-[10px] text-[#ff3333] text-center mt-2 uppercase tracking-wider">
              Not connected to NodeODM
            </p>
          )}
        </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}


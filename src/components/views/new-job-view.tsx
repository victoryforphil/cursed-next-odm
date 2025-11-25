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
import type { ODMOption, TaskOption, ImageFile } from '@/lib/types/nodeodm';

interface NewJobViewProps {
  odmOptions: ODMOption[];
  isConnected: boolean;
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

export function NewJobView({ odmOptions, isConnected, onTaskCreated }: NewJobViewProps) {
  const [selectedFiles, setSelectedFiles] = useState<ImageFile[]>([]);
  const [taskName, setTaskName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(1);
  const [customOptions, setCustomOptions] = useState<Map<string, string | number | boolean>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['QUALITY', 'OUTPUT']));
  const [isCreating, setIsCreating] = useState(false);

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

  const handleCreate = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setIsCreating(true);
    // Simulate - in real app would call API
    await new Promise(r => setTimeout(r, 1500));
    setIsCreating(false);
    onTaskCreated();
  }, [selectedFiles, onTaskCreated]);

  const gpsCount = selectedFiles.filter(f => f.exif?.latitude !== undefined).length;

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
                    selectedFiles={selectedFiles}
                    setSelectedFiles={setSelectedFiles}
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
                        onClick={() => setSelectedFiles([])}
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
                  <MapView images={selectedFiles} className="absolute inset-0" />
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


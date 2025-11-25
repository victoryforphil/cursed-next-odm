'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Rocket,
  Settings,
  X,
  Info,
  Loader2,
  Search,
  Image as ImageIcon,
  MapPin,
  Sliders,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ODMOption, TaskOption, ImageFile } from '@/lib/types/nodeodm';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  odmOptions: ODMOption[];
  selectedFiles: ImageFile[];
  onCreateTask: (name: string, options: TaskOption[]) => Promise<void>;
  isCreating?: boolean;
}

// Common ODM presets
const presets = [
  {
    name: 'Fast',
    description: 'Quick processing, lower resolution',
    icon: '⚡',
    options: [
      { name: 'fast-orthophoto', value: true },
      { name: 'feature-quality', value: 'low' },
      { name: 'pc-quality', value: 'low' },
    ],
  },
  {
    name: 'Default',
    description: 'Balanced quality and speed',
    icon: '⚖️',
    options: [],
  },
  {
    name: 'High Quality',
    description: 'Best quality, slower',
    icon: '✨',
    options: [
      { name: 'feature-quality', value: 'ultra' },
      { name: 'pc-quality', value: 'high' },
      { name: 'mesh-octree-depth', value: 12 },
    ],
  },
  {
    name: 'DTM/DSM',
    description: 'Terrain models',
    icon: '🏔️',
    options: [
      { name: 'dsm', value: true },
      { name: 'dtm', value: true },
      { name: 'dem-resolution', value: 2 },
    ],
  },
];

// Group options by category
const optionCategories: Record<string, string[]> = {
  'Quality': ['feature-quality', 'pc-quality', 'mesh-octree-depth', 'depthmap-resolution', 'orthophoto-resolution'],
  'Output': ['dsm', 'dtm', 'orthophoto-png', 'orthophoto-kmz', 'orthophoto-no-tiled', 'cog', 'copy-to'],
  'Processing': ['fast-orthophoto', 'skip-3dmodel', 'skip-report', 'skip-orthophoto', 'ignore-gsd', 'pc-filter', 'pc-sample'],
  'Camera': ['camera-lens', 'radiometric-calibration', 'use-fixed-camera-params'],
  'Geolocation': ['gps-accuracy', 'use-exif', 'boundary', 'auto-boundary'],
  'Advanced': [],
};

function categorizeOption(name: string): string {
  for (const [category, options] of Object.entries(optionCategories)) {
    if (options.some(opt => name.includes(opt) || opt.includes(name))) {
      return category;
    }
  }
  return 'Advanced';
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  odmOptions,
  selectedFiles,
  onCreateTask,
  isCreating,
}: CreateTaskDialogProps) {
  const [taskName, setTaskName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(1); // Default preset
  const [customOptions, setCustomOptions] = useState<Map<string, string | number | boolean>>(
    new Map()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Quality', 'Output', 'Processing'])
  );

  // Group and filter options
  const groupedOptions = useMemo(() => {
    const groups: Record<string, ODMOption[]> = {};
    const query = searchQuery.toLowerCase();

    odmOptions.forEach((option) => {
      if (query && !option.name.toLowerCase().includes(query) && !option.help.toLowerCase().includes(query)) {
        return;
      }
      const category = categorizeOption(option.name);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(option);
    });

    // Sort categories
    const orderedCategories = ['Quality', 'Output', 'Processing', 'Camera', 'Geolocation', 'Advanced'];
    const result: [string, ODMOption[]][] = [];
    
    orderedCategories.forEach((cat) => {
      if (groups[cat] && groups[cat].length > 0) {
        result.push([cat, groups[cat]]);
      }
    });

    return result;
  }, [odmOptions, searchQuery]);

  const handlePresetSelect = useCallback((index: number) => {
    setSelectedPreset(index);
    const preset = presets[index];
    const newOptions = new Map<string, string | number | boolean>();
    preset.options.forEach((opt) => {
      newOptions.set(opt.name, opt.value);
    });
    setCustomOptions(newOptions);
  }, []);

  const handleOptionChange = useCallback(
    (name: string, value: string | number | boolean) => {
      setCustomOptions((prev) => {
        const newMap = new Map(prev);
        if (value === '' || value === false) {
          newMap.delete(name);
        } else {
          newMap.set(name, value);
        }
        return newMap;
      });
      setSelectedPreset(-1); // Custom
    },
    []
  );

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    const options: TaskOption[] = Array.from(customOptions.entries()).map(
      ([name, value]) => ({ name, value })
    );

    const name = taskName.trim() || `Task ${new Date().toLocaleString()}`;
    await onCreateTask(name, options);
    
    // Reset form
    setTaskName('');
    setSelectedPreset(1);
    setCustomOptions(new Map());
    setSearchQuery('');
  }, [taskName, customOptions, onCreateTask]);

  const gpsCount = selectedFiles.filter(
    (f) => f.exif?.latitude !== undefined && f.exif?.longitude !== undefined
  ).length;

  const modifiedCount = customOptions.size;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-in Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 bottom-0 w-[480px] bg-background border-l z-50',
          'flex flex-col shadow-2xl',
          'animate-in slide-in-from-right duration-300'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Create Task</h2>
              <p className="text-xs text-muted-foreground">
                Configure processing options
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* File Summary */}
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <ImageIcon className="h-4 w-4 text-emerald-500" />
                  <span className="font-medium">{selectedFiles.length}</span>
                  <span className="text-muted-foreground">images</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">{gpsCount}</span>
                  <span className="text-muted-foreground">with GPS</span>
                </div>
              </div>
            </div>

            {/* Task Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Task Name</label>
              <Input
                placeholder="Enter a name for this task..."
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Presets */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Quick Presets</label>
              <div className="grid grid-cols-4 gap-2">
                {presets.map((preset, index) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetSelect(index)}
                    className={cn(
                      'p-3 rounded-lg border text-center transition-all',
                      'hover:border-primary/50 hover:bg-accent/50',
                      selectedPreset === index && 'border-primary bg-accent ring-1 ring-primary'
                    )}
                  >
                    <div className="text-xl mb-1">{preset.icon}</div>
                    <div className="font-medium text-xs">{preset.name}</div>
                  </button>
                ))}
              </div>
              {selectedPreset >= 0 && (
                <p className="text-xs text-muted-foreground">
                  {presets[selectedPreset].description}
                </p>
              )}
              {selectedPreset === -1 && (
                <p className="text-xs text-amber-500">
                  Custom configuration ({modifiedCount} options modified)
                </p>
              )}
            </div>

            <Separator />

            {/* Advanced Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Processing Options
                </label>
                {modifiedCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {modifiedCount} modified
                  </Badge>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search options..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Options by Category */}
              <TooltipProvider delayDuration={300}>
                <div className="space-y-2">
                  {groupedOptions.map(([category, options]) => (
                    <div key={category} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(category)}
                        className={cn(
                          'w-full flex items-center justify-between p-3 text-sm font-medium',
                          'hover:bg-accent/50 transition-colors',
                          expandedCategories.has(category) && 'bg-accent/30'
                        )}
                      >
                        <span>{category}</span>
                        <Badge variant="outline" className="text-xs">
                          {options.length}
                        </Badge>
                      </button>
                      
                      {expandedCategories.has(category) && (
                        <div className="border-t bg-muted/20">
                          {options.map((option) => (
                            <div
                              key={option.name}
                              className={cn(
                                'flex items-start gap-3 p-3 border-b last:border-b-0',
                                'hover:bg-accent/30 transition-colors',
                                customOptions.has(option.name) && 'bg-primary/5'
                              )}
                            >
                              {option.type === 'bool' ? (
                                <Checkbox
                                  id={option.name}
                                  checked={
                                    customOptions.get(option.name) === true ||
                                    customOptions.get(option.name) === 'true'
                                  }
                                  onCheckedChange={(checked) =>
                                    handleOptionChange(option.name, !!checked)
                                  }
                                  className="mt-0.5"
                                />
                              ) : (
                                <Input
                                  id={option.name}
                                  type={
                                    option.type === 'int' || option.type === 'float'
                                      ? 'number'
                                      : 'text'
                                  }
                                  placeholder={option.value}
                                  value={
                                    customOptions.get(option.name)?.toString() ?? ''
                                  }
                                  onChange={(e) =>
                                    handleOptionChange(
                                      option.name,
                                      option.type === 'int'
                                        ? parseInt(e.target.value) || ''
                                        : option.type === 'float'
                                        ? parseFloat(e.target.value) || ''
                                        : e.target.value
                                    )
                                  }
                                  className="w-24 h-8 text-xs"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <label
                                    htmlFor={option.name}
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    {option.name}
                                  </label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="left"
                                      className="max-w-xs"
                                    >
                                      <p className="text-xs">{option.help}</p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Type: {option.type} • Domain: {option.domain}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {option.help}
                                </p>
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                  Default: {option.value || 'none'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {groupedOptions.length === 0 && searchQuery && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No options match "{searchQuery}"</p>
                    </div>
                  )}

                  {odmOptions.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Connect to NodeODM to load options</p>
                    </div>
                  )}
                </div>
              </TooltipProvider>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t bg-card space-y-3">
          <Button
            className="w-full h-11 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            onClick={handleCreate}
            disabled={selectedFiles.length === 0 || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Creating Task...
              </>
            ) : (
              <>
                <Rocket className="h-5 w-5" />
                Start Processing
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}

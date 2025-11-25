'use client';

import React, { useState, useCallback } from 'react';
import {
  Rocket,
  Settings,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
    name: 'Fast (Low Quality)',
    description: 'Quick processing, lower resolution',
    options: [
      { name: 'fast-orthophoto', value: true },
      { name: 'feature-quality', value: 'low' },
      { name: 'pc-quality', value: 'low' },
    ],
  },
  {
    name: 'Default',
    description: 'Balanced quality and speed',
    options: [],
  },
  {
    name: 'High Quality',
    description: 'Best quality, slower processing',
    options: [
      { name: 'feature-quality', value: 'ultra' },
      { name: 'pc-quality', value: 'high' },
      { name: 'mesh-octree-depth', value: 12 },
    ],
  },
  {
    name: 'DTM/DSM',
    description: 'Optimized for terrain models',
    options: [
      { name: 'dsm', value: true },
      { name: 'dtm', value: true },
      { name: 'dem-resolution', value: 2 },
    ],
  },
];

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customOptions, setCustomOptions] = useState<Map<string, string | number | boolean>>(
    new Map()
  );

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
    setShowAdvanced(false);
  }, [taskName, customOptions, onCreateTask]);

  const gpsCount = selectedFiles.filter(
    (f) => f.exif?.latitude !== undefined && f.exif?.longitude !== undefined
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Create New Task
          </DialogTitle>
          <DialogDescription>
            Process {selectedFiles.length} images with OpenDroneMap
            {gpsCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {gpsCount} with GPS
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Task name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Task Name</label>
            <Input
              placeholder="Enter a name for this task..."
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
            />
          </div>

          {/* Presets */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Processing Preset</label>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(index)}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all',
                    'hover:border-primary/50 hover:bg-accent/50',
                    selectedPreset === index && 'border-primary bg-accent'
                  )}
                >
                  <div className="font-medium text-sm">{preset.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced Options
                </span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-64 mt-2 border rounded-lg">
                <div className="p-4 space-y-4">
                  <TooltipProvider>
                    {odmOptions.map((option) => (
                      <div
                        key={option.name}
                        className="flex items-start gap-3"
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
                            className="w-32"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={option.name}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {option.name}
                          </label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 inline ml-1 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              className="max-w-xs"
                            >
                              <p className="text-xs">{option.help}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Type: {option.type} ({option.domain})
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <p className="text-xs text-muted-foreground truncate">
                            Default: {option.value}
                          </p>
                        </div>
                      </div>
                    ))}
                  </TooltipProvider>
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={selectedFiles.length === 0 || isCreating}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


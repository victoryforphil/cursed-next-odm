'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FolderOpen,
  X,
  CheckCircle2,
  MapPin,
  Image as ImageIcon,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { FileTree, getAllFileIds } from './file-tree';
import { processFiles, isImageFile, extractExifData } from '@/lib/utils/exif';
import type { FileNode, ImageFile, ExifData } from '@/lib/types/nodeodm';

interface FileBrowserProps {
  onFilesSelected?: (files: ImageFile[]) => void;
  selectedFiles: ImageFile[];
  setSelectedFiles: (files: ImageFile[]) => void;
}

export function FileBrowser({
  onFilesSelected,
  selectedFiles,
  setSelectedFiles,
}: FileBrowserProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [allFiles, setAllFiles] = useState<Map<string, { file: File; imageFile: ImageFile }>>(
    new Map()
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processStatus, setProcessStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Build tree structure from files
  const buildFileTree = useCallback(
    (
      files: Map<string, { file: File; imageFile: ImageFile }>
    ): FileNode[] => {
      const root: Map<string, FileNode> = new Map();

      files.forEach(({ imageFile }, id) => {
        const pathParts = imageFile.path.split('/').filter(Boolean);

        if (pathParts.length === 1) {
          // File at root level
          root.set(id, { ...imageFile, id });
        } else {
          // File in subdirectory
          let currentLevel = root;
          let currentPath = '';

          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const folderId = `folder-${currentPath}`;

            if (!currentLevel.has(folderId)) {
              const folderNode: FileNode = {
                id: folderId,
                name: part,
                path: currentPath,
                type: 'directory',
                children: [],
              };
              currentLevel.set(folderId, folderNode);
            }

            const folder = currentLevel.get(folderId)!;
            if (!folder.children) {
              folder.children = [];
            }

            if (i === pathParts.length - 2) {
              // Add file to this folder
              folder.children.push({ ...imageFile, id });
            } else {
              // Navigate to next level
              const childMap = new Map<string, FileNode>();
              folder.children.forEach((child) => childMap.set(child.id, child));
              currentLevel = childMap;
            }
          }
        }
      });

      // Convert to array and sort
      const sortNodes = (nodes: FileNode[]): FileNode[] => {
        return nodes
          .sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .map((node) => {
            if (node.children) {
              return { ...node, children: sortNodes(node.children) };
            }
            return node;
          });
      };

      return sortNodes(Array.from(root.values()));
    },
    []
  );

  // Process dropped/selected files
  const processNewFiles = useCallback(
    async (files: File[]) => {
      setIsProcessing(true);
      setProcessProgress(0);
      setProcessStatus('Scanning files...');

      const imageFiles = files.filter(isImageFile);
      const totalFiles = imageFiles.length;

      if (totalFiles === 0) {
        setIsProcessing(false);
        setProcessStatus('No image files found');
        return;
      }

      const newFilesMap = new Map(allFiles);
      let processed = 0;

      for (const file of imageFiles) {
        const path = file.webkitRelativePath || file.name;
        const id = `${path}-${file.lastModified}-${file.size}`;

        if (!newFilesMap.has(id)) {
          setProcessStatus(`Processing: ${file.name}`);

          const exif = await extractExifData(file);

          const imageFile: ImageFile = {
            id,
            name: file.name,
            path,
            type: 'file',
            size: file.size,
            lastModified: new Date(file.lastModified),
            exif: exif || undefined,
          };

          newFilesMap.set(id, { file, imageFile });
        }

        processed++;
        setProcessProgress((processed / totalFiles) * 100);
      }

      setAllFiles(newFilesMap);
      setFileTree(buildFileTree(newFilesMap));
      setIsProcessing(false);
      setProcessStatus(`Loaded ${newFilesMap.size} images`);
    },
    [allFiles, buildFileTree]
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => processNewFiles(acceptedFiles),
    noClick: true,
    noKeyboard: true,
  });

  // Handle folder selection
  const handleFolderSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        processNewFiles(Array.from(files));
      }
    },
    [processNewFiles]
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        processNewFiles(Array.from(files));
      }
    },
    [processNewFiles]
  );

  // Toggle file selection
  const handleToggleSelect = useCallback(
    (node: FileNode, selected: boolean) => {
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (selected) {
          newSet.add(node.id);
        } else {
          newSet.delete(node.id);
        }
        return newSet;
      });
    },
    []
  );

  // Toggle all files in a folder
  const handleToggleSelectAll = useCallback(
    (node: FileNode, selected: boolean) => {
      const fileIds = getAllFileIds(node);
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        fileIds.forEach((id) => {
          if (selected) {
            newSet.add(id);
          } else {
            newSet.delete(id);
          }
        });
        return newSet;
      });
    },
    []
  );

  // Update selected files when selection changes
  React.useEffect(() => {
    const selected: ImageFile[] = [];
    selectedIds.forEach((id) => {
      const entry = allFiles.get(id);
      if (entry) {
        selected.push(entry.imageFile);
      }
    });
    setSelectedFiles(selected);
    onFilesSelected?.(selected);
  }, [selectedIds, allFiles, setSelectedFiles, onFilesSelected]);

  // Stats
  const stats = useMemo(() => {
    const withGps = selectedFiles.filter(
      (f) => f.exif?.latitude !== undefined && f.exif?.longitude !== undefined
    ).length;
    const totalSize = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    return { total: selectedFiles.length, withGps, totalSize };
  }, [selectedFiles]);

  // Clear all
  const handleClear = useCallback(() => {
    setAllFiles(new Map());
    setFileTree([]);
    setSelectedIds(new Set());
    setSelectedFiles([]);
    setProcessStatus('');
  }, [setSelectedFiles]);

  // Select all
  const handleSelectAll = useCallback(() => {
    const allIds = new Set<string>();
    allFiles.forEach((_, id) => allIds.add(id));
    setSelectedIds(allIds);
  }, [allFiles]);

  // Deselect all
  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Get raw files for upload
  const getSelectedRawFiles = useCallback((): File[] => {
    const files: File[] = [];
    selectedIds.forEach((id) => {
      const entry = allFiles.get(id);
      if (entry) {
        files.push(entry.file);
      }
    });
    return files;
  }, [selectedIds, allFiles]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            File Browser
          </CardTitle>
          <div className="flex items-center gap-2">
            {allFiles.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 transition-colors',
            'flex flex-col items-center justify-center gap-3',
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
        >
          <input {...getInputProps()} />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.jpg,.jpeg,.png,.tiff,.tif,.dng"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is not in types
            webkitdirectory=""
            multiple
            onChange={handleFolderSelect}
            className="hidden"
          />

          <Upload
            className={cn(
              'h-10 w-10',
              isDragActive ? 'text-primary' : 'text-muted-foreground'
            )}
          />

          <div className="text-center">
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop files here' : 'Drag & drop images'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or use the buttons below
            </p>
          </div>

          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Select Files
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Select Folder
            </Button>
          </div>
        </div>

        {/* Processing indicator */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="truncate flex-1">{processStatus}</span>
              <span className="text-muted-foreground">
                {Math.round(processProgress)}%
              </span>
            </div>
            <Progress value={processProgress} className="h-1" />
          </div>
        )}

        {/* Selection stats */}
        {allFiles.size > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {stats.total} / {allFiles.size} selected
                </Badge>
                <Badge
                  variant={stats.withGps > 0 ? 'default' : 'outline'}
                  className="gap-1"
                >
                  <MapPin className="h-3 w-3" />
                  {stats.withGps} with GPS
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                  Deselect
                </Button>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* File tree */}
        <ScrollArea className="flex-1 -mx-4 px-4">
          <FileTree
            nodes={fileTree}
            selectedFiles={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
          />
        </ScrollArea>

        {/* Status bar */}
        {processStatus && !isProcessing && allFiles.size > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            {processStatus}
            {stats.totalSize > 0 && (
              <span className="ml-auto">
                {formatFileSize(stats.totalSize)} total
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export { FileBrowser };


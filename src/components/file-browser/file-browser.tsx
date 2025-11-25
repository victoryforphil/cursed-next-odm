'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { FileTree, getAllFileIds } from './file-tree';
import { isImageFile, extractExifData } from '@/lib/utils/exif';
import type { FileNode, ImageFile } from '@/lib/types/nodeodm';

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
    (files: Map<string, { file: File; imageFile: ImageFile }>): FileNode[] => {
      const root: Map<string, FileNode> = new Map();

      files.forEach(({ imageFile }, id) => {
        const pathParts = imageFile.path.split('/').filter(Boolean);

        if (pathParts.length === 1) {
          root.set(id, { ...imageFile, id });
        } else {
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
            if (!folder.children) folder.children = [];

            if (i === pathParts.length - 2) {
              folder.children.push({ ...imageFile, id });
            } else {
              const childMap = new Map<string, FileNode>();
              folder.children.forEach((child) => childMap.set(child.id, child));
              currentLevel = childMap;
            }
          }
        }
      });

      const sortNodes = (nodes: FileNode[]): FileNode[] => {
        return nodes
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .map((node) => {
            if (node.children) return { ...node, children: sortNodes(node.children) };
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
      setProcessStatus('SCANNING...');

      const imageFiles = files.filter(isImageFile);
      const totalFiles = imageFiles.length;

      if (totalFiles === 0) {
        setIsProcessing(false);
        setProcessStatus('NO IMAGES FOUND');
        return;
      }

      const newFilesMap = new Map(allFiles);
      let processed = 0;

      for (const file of imageFiles) {
        const path = file.webkitRelativePath || file.name;
        const id = `${path}-${file.lastModified}-${file.size}`;

        if (!newFilesMap.has(id)) {
          setProcessStatus(`PROCESSING: ${file.name}`);
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
      setProcessStatus(`${newFilesMap.size} IMAGES LOADED`);
    },
    [allFiles, buildFileTree]
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => processNewFiles(acceptedFiles),
    noClick: true,
    noKeyboard: true,
  });

  const handleFolderSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) processNewFiles(Array.from(files));
    },
    [processNewFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) processNewFiles(Array.from(files));
    },
    [processNewFiles]
  );

  const handleToggleSelect = useCallback((node: FileNode, selected: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (selected) newSet.add(node.id);
      else newSet.delete(node.id);
      return newSet;
    });
  }, []);

  const handleToggleSelectAll = useCallback((node: FileNode, selected: boolean) => {
    const fileIds = getAllFileIds(node);
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      fileIds.forEach((id) => {
        if (selected) newSet.add(id);
        else newSet.delete(id);
      });
      return newSet;
    });
  }, []);

  // Update selected files when selection changes
  React.useEffect(() => {
    const selected: ImageFile[] = [];
    selectedIds.forEach((id) => {
      const entry = allFiles.get(id);
      if (entry) selected.push(entry.imageFile);
    });
    setSelectedFiles(selected);
    onFilesSelected?.(selected);
  }, [selectedIds, allFiles, setSelectedFiles, onFilesSelected]);

  const handleSelectAll = useCallback(() => {
    const allIds = new Set<string>();
    allFiles.forEach((_, id) => allIds.add(id));
    setSelectedIds(allIds);
  }, [allFiles]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <div className="h-full flex flex-col" {...getRootProps()}>
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

      {/* Drop zone */}
      <div
        className={cn(
          'border border-dashed p-6 transition-colors mb-4',
          'flex flex-col items-center justify-center gap-3',
          isDragActive ? 'border-white bg-white/5' : 'border-border hover:border-white/50'
        )}
      >
        <Upload className={cn('h-8 w-8', isDragActive ? 'text-white' : 'text-muted-foreground')} />
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider">
            {isDragActive ? 'Drop Files' : 'Drag & Drop'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs uppercase tracking-wider bg-transparent border-border hover:bg-white hover:text-black"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-3 w-3 mr-2" />
            Files
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs uppercase tracking-wider bg-transparent border-border hover:bg-white hover:text-black"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpen className="h-3 w-3 mr-2" />
            Folder
          </Button>
        </div>
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="truncate flex-1 text-muted-foreground">{processStatus}</span>
            <span className="text-[#00ff88]">{Math.round(processProgress)}%</span>
          </div>
          <Progress value={processProgress} className="h-1" />
        </div>
      )}

      {/* Selection controls */}
      {allFiles.size > 0 && (
        <div className="flex items-center justify-between mb-2 text-xs uppercase tracking-wider">
          <span className="text-muted-foreground">
            {selectedIds.size} / {allFiles.size}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="text-muted-foreground hover:text-white transition-colors"
            >
              All
            </button>
            <span className="text-border">/</span>
            <button
              onClick={handleDeselectAll}
              className="text-muted-foreground hover:text-white transition-colors"
            >
              None
            </button>
          </div>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto -mx-4 px-4">
        <FileTree
          nodes={fileTree}
          selectedFiles={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
        />
      </div>

      {/* Status */}
      {processStatus && !isProcessing && allFiles.size > 0 && (
        <div className="pt-2 mt-2 border-t border-border text-[10px] text-muted-foreground uppercase tracking-wider">
          {processStatus}
        </div>
      )}
    </div>
  );
}

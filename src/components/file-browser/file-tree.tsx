'use client';

import React, { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Check,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import type { FileNode, ImageFile } from '@/lib/types/nodeodm';

interface FileTreeProps {
  nodes: FileNode[];
  selectedFiles: Set<string>;
  onToggleSelect: (node: FileNode, selected: boolean) => void;
  onToggleSelectAll: (node: FileNode, selected: boolean) => void;
  level?: number;
}

interface FileTreeNodeProps {
  node: FileNode;
  selectedFiles: Set<string>;
  onToggleSelect: (node: FileNode, selected: boolean) => void;
  onToggleSelectAll: (node: FileNode, selected: boolean) => void;
  level: number;
}

function getFileCount(node: FileNode): number {
  if (node.type === 'file') return 1;
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + getFileCount(child), 0);
}

function getAllFileIds(node: FileNode): string[] {
  if (node.type === 'file') return [node.id];
  if (!node.children) return [];
  return node.children.flatMap(getAllFileIds);
}

function getSelectionState(
  node: FileNode,
  selectedFiles: Set<string>
): 'none' | 'partial' | 'all' {
  if (node.type === 'file') {
    return selectedFiles.has(node.id) ? 'all' : 'none';
  }

  const fileIds = getAllFileIds(node);
  if (fileIds.length === 0) return 'none';

  const selectedCount = fileIds.filter((id) => selectedFiles.has(id)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === fileIds.length) return 'all';
  return 'partial';
}

function FileTreeNode({
  node,
  selectedFiles,
  onToggleSelect,
  onToggleSelectAll,
  level,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2);
  const isDirectory = node.type === 'directory';
  const selectionState = getSelectionState(node, selectedFiles);
  const fileCount = getFileCount(node);

  const handleToggle = useCallback(() => {
    if (isDirectory) {
      setExpanded((prev) => !prev);
    }
  }, [isDirectory]);

  const handleSelect = useCallback(
    (checked: boolean) => {
      if (isDirectory) {
        onToggleSelectAll(node, checked);
      } else {
        onToggleSelect(node, checked);
      }
    },
    [isDirectory, node, onToggleSelect, onToggleSelectAll]
  );

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer transition-colors',
          'hover:bg-accent/50 group',
          selectionState !== 'none' && 'bg-accent/30'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={handleToggle}
          className={cn(
            'p-0.5 rounded hover:bg-accent',
            !isDirectory && 'invisible'
          )}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Checkbox */}
        <div className="relative flex items-center justify-center">
          <Checkbox
            checked={selectionState === 'all'}
            onCheckedChange={handleSelect}
            className={cn(
              'h-4 w-4',
              selectionState === 'partial' && 'data-[state=unchecked]:bg-primary/50'
            )}
          />
          {selectionState === 'partial' && (
            <Minus className="absolute h-3 w-3 text-primary-foreground pointer-events-none" />
          )}
        </div>

        {/* Icon */}
        <span className="flex-shrink-0" onClick={handleToggle}>
          {isDirectory ? (
            expanded ? (
              <FolderOpen className="h-4 w-4 text-amber-500" />
            ) : (
              <Folder className="h-4 w-4 text-amber-500" />
            )
          ) : (
            <ImageIcon className="h-4 w-4 text-emerald-500" />
          )}
        </span>

        {/* Name */}
        <span
          className="flex-1 truncate text-sm"
          onClick={handleToggle}
          title={node.name}
        >
          {node.name}
        </span>

        {/* File count for directories */}
        {isDirectory && fileCount > 0 && (
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
            {fileCount}
          </span>
        )}

        {/* Size for files */}
        {!isDirectory && node.size && (
          <span className="text-xs text-muted-foreground">
            {formatFileSize(node.size)}
          </span>
        )}
      </div>

      {/* Children */}
      {isDirectory && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              selectedFiles={selectedFiles}
              onToggleSelect={onToggleSelect}
              onToggleSelectAll={onToggleSelectAll}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function FileTree({
  nodes,
  selectedFiles,
  onToggleSelect,
  onToggleSelectAll,
  level = 0,
}: FileTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Folder className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No files loaded</p>
        <p className="text-xs mt-1">Drop files or select a folder to begin</p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.id}
          node={node}
          selectedFiles={selectedFiles}
          onToggleSelect={onToggleSelect}
          onToggleSelectAll={onToggleSelectAll}
          level={level}
        />
      ))}
    </div>
  );
}

export { getAllFileIds, getFileCount };


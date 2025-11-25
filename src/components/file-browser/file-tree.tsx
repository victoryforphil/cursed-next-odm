'use client';

import React, { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import type { FileNode } from '@/lib/types/nodeodm';

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

function getSelectionState(node: FileNode, selectedFiles: Set<string>): 'none' | 'partial' | 'all' {
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
    if (isDirectory) setExpanded((prev) => !prev);
  }, [isDirectory]);

  const handleSelect = useCallback(
    (checked: boolean) => {
      if (isDirectory) onToggleSelectAll(node, checked);
      else onToggleSelect(node, checked);
    },
    [isDirectory, node, onToggleSelect, onToggleSelectAll]
  );

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-1 py-1.5 px-2 cursor-pointer transition-colors',
          'hover:bg-accent group',
          selectionState !== 'none' && 'bg-accent/50'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Expand/Collapse */}
        <button
          onClick={handleToggle}
          className={cn('p-0.5', !isDirectory && 'invisible')}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>

        {/* Checkbox */}
        <div className="relative flex items-center justify-center">
          <Checkbox
            checked={selectionState === 'all'}
            onCheckedChange={handleSelect}
            className={cn(
              'h-3.5 w-3.5 border-border',
              'data-[state=checked]:bg-white data-[state=checked]:text-black',
              selectionState === 'partial' && 'data-[state=unchecked]:bg-white/30'
            )}
          />
          {selectionState === 'partial' && (
            <Minus className="absolute h-2.5 w-2.5 text-black pointer-events-none" />
          )}
        </div>

        {/* Icon */}
        <span className="flex-shrink-0" onClick={handleToggle}>
          {isDirectory ? (
            expanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-[#ffcc00]" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-[#ffcc00]" />
            )
          ) : (
            <ImageIcon className="h-3.5 w-3.5 text-[#00ff88]" />
          )}
        </span>

        {/* Name */}
        <span
          className="flex-1 truncate text-xs uppercase tracking-wider"
          onClick={handleToggle}
          title={node.name}
        >
          {node.name}
        </span>

        {/* Count */}
        {isDirectory && fileCount > 0 && (
          <span className="text-[10px] text-muted-foreground">{fileCount}</span>
        )}

        {/* Size */}
        {!isDirectory && node.size && (
          <span className="text-[10px] text-muted-foreground">
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
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
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
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Folder className="h-8 w-8 mb-3 opacity-30" />
        <p className="text-xs uppercase tracking-wider">No Files</p>
      </div>
    );
  }

  return (
    <div className="py-1">
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

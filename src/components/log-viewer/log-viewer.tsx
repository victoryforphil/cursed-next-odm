'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Terminal,
  ArrowDown,
  Copy,
  Check,
  Pause,
  Play,
  Trash2,
  Search,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface LogViewerProps {
  logs: string[];
  title?: string;
  maxLines?: number;
  autoScroll?: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  className?: string;
}

// Parse log line to extract level and format
function parseLogLine(line: string, index: number, totalLogs: number): {
  level: 'info' | 'warning' | 'error' | 'debug' | 'success';
  content: string;
  timestamp: string;
} {
  const lowered = line.toLowerCase();
  
  // Detect log level
  let level: 'info' | 'warning' | 'error' | 'debug' | 'success' = 'info';
  if (lowered.includes('error') || lowered.includes('failed') || lowered.includes('exception')) {
    level = 'error';
  } else if (lowered.includes('warning') || lowered.includes('warn')) {
    level = 'warning';
  } else if (lowered.includes('debug')) {
    level = 'debug';
  } else if (lowered.includes('success') || lowered.includes('completed') || lowered.includes('done')) {
    level = 'success';
  }
  
  // Try to extract timestamp from line
  let timestamp: string | undefined;
  const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[^\]]*)\]/);
  if (timestampMatch) {
    timestamp = timestampMatch[1];
  }
  
  // If no timestamp found, generate one based on position (newest first)
  if (!timestamp) {
    const now = new Date();
    const offset = totalLogs - index - 1; // Since we reversed, newest is at index 0
    const logTime = new Date(now.getTime() - offset * 1000); // Approximate 1 second per log
    timestamp = logTime.toISOString().replace('T', ' ').substring(0, 19);
  }
  
  return {
    level,
    content: timestampMatch ? line.slice(timestampMatch[0].length).trim() : line,
    timestamp,
  };
}

const levelColors = {
  info: 'text-foreground',
  warning: 'text-amber-500',
  error: 'text-red-500',
  debug: 'text-muted-foreground',
  success: 'text-green-500',
};

export function LogViewer({
  logs,
  title = 'Console Output',
  maxLines = 10000,
  autoScroll: externalAutoScroll,
  onAutoScrollChange,
  className,
}: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [internalAutoScroll, setInternalAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<Set<number>>(new Set());
  
  const autoScroll = externalAutoScroll ?? internalAutoScroll;
  const setAutoScroll = onAutoScrollChange ?? setInternalAutoScroll;

  // Auto-scroll to top (newest on top)
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    }
  }, [logs, autoScroll]);

  // Reverse logs so newest is first, then take first N lines
  const displayLogs = [...logs].reverse().slice(0, maxLines);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setHighlightedLines(new Set());
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const matches = new Set<number>();
    displayLogs.forEach((line, index) => {
      if (line.toLowerCase().includes(query)) {
        matches.add(index);
      }
    });
    setHighlightedLines(matches);
  }, [searchQuery, logs, maxLines, displayLogs]);

  // Copy logs to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  }, [logs]);

  // Scroll to top (newest on top)
  const scrollToTop = useCallback(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    }
    setAutoScroll(true);
  }, [setAutoScroll]);

  // Handle scroll to detect manual scrolling
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const isAtTop = scrollContainer.scrollTop < 50;
        if (!isAtTop && autoScroll) {
          setAutoScroll(false);
        }
      }
    }
  }, [autoScroll, setAutoScroll]);

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {title}
            {logs.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {logs.length.toLocaleString()} lines
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSearch(!showSearch)}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              {autoScroll ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            {!autoScroll && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={scrollToTop}
              >
                <ArrowDown className="h-4 w-4 rotate-180" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Search bar */}
        {showSearch && (
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-7 w-7"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {highlightedLines.size > 0 && (
              <Badge variant="outline">
                {highlightedLines.size} matches
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea 
          ref={scrollRef} 
          className="h-full"
          onScrollCapture={handleScroll}
        >
          <div className="p-4 font-mono text-xs leading-relaxed">
            {displayLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Terminal className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">No output yet</p>
                <p className="text-xs mt-1">
                  Logs will appear here when processing starts
                </p>
              </div>
            ) : (
              displayLogs.map((line, index) => {
                // displayLogs is already reversed (newest first), so index 0 is newest
                // Calculate original index in logs array for timestamp generation
                const originalIndex = logs.length - 1 - index;
                const { level, content, timestamp } = parseLogLine(line, originalIndex, logs.length);
                const isHighlighted = highlightedLines.has(index);
                
                return (
                  <div
                    key={`log-${originalIndex}`}
                    className={cn(
                      'py-0.5 px-2 -mx-2 rounded flex items-start gap-2',
                      isHighlighted && 'bg-yellow-500/20',
                      levelColors[level]
                    )}
                  >
                    <span className="text-muted-foreground flex-shrink-0 text-[10px]">
                      [{timestamp}]
                    </span>
                    <span className="whitespace-pre-wrap break-words flex-1 min-w-0">
                      {content || line}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


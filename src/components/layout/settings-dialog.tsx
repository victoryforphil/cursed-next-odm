'use client';

import React, { useState } from 'react';
import { Settings, Server, Key, TestTube, Loader2, CheckCircle2, XCircle } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseUrl: string;
  token?: string;
  onSave: (baseUrl: string, token?: string) => void;
  onTest: (baseUrl: string, token?: string) => Promise<boolean>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  baseUrl: initialBaseUrl,
  token: initialToken,
  onSave,
  onTest,
}: SettingsDialogProps) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [token, setToken] = useState(initialToken || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const success = await onTest(baseUrl, token || undefined);
      setTestResult(success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    }
    setIsTesting(false);
  };

  const handleSave = () => {
    onSave(baseUrl, token || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your NodeODM server connection
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Server URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              NodeODM Server URL
            </label>
            <Input
              placeholder="http://localhost:3000"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setTestResult(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              The URL of your NodeODM server instance
            </p>
          </div>

          <Separator />

          {/* Token */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" />
              Authentication Token (Optional)
            </label>
            <Input
              type="password"
              placeholder="Enter token if required"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setTestResult(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Only needed if your NodeODM server requires authentication
            </p>
          </div>

          {/* Test connection */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !baseUrl}
              className="flex-1"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            {testResult && (
              <div
                className={cn(
                  'flex items-center gap-1.5 text-sm',
                  testResult === 'success' ? 'text-green-500' : 'text-red-500'
                )}
              >
                {testResult === 'success' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Connected
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Failed
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type * as Unzipper from 'unzipper';

// Cache directory for extracted pointclouds
const CACHE_DIR = path.join(os.tmpdir(), 'odm-pointcloud-cache');

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

// Get the NodeODM base URL from environment or default
function getNodeODMUrl(): string {
  return process.env.NODEODM_URL || 'http://localhost:3001';
}

// Check if cached file exists and is recent (less than 1 hour old)
async function getCachedFile(taskId: string, ext: string): Promise<string | null> {
  const cachedPath = path.join(CACHE_DIR, `${taskId}.${ext}`);
  try {
    const stats = await fs.stat(cachedPath);
    const ageMs = Date.now() - stats.mtimeMs;
    const maxAgeMs = 60 * 60 * 1000; // 1 hour
    
    if (ageMs < maxAgeMs) {
      return cachedPath;
    }
  } catch {
    // File doesn't exist
  }
  return null;
}

// Point cloud file paths to search for in order of preference
const POINTCLOUD_PATHS = [
  // Georeferenced LAZ (compressed, smaller)
  'odm_georeferencing/odm_georeferenced_model.laz',
  // Georeferenced LAS (uncompressed)
  'odm_georeferencing/odm_georeferenced_model.las',
  // Coarse point cloud
  'odm_georeferencing/odm_georeferenced_model.copc.laz',
  // Alternative locations
  'georeferenced_model.laz',
  'georeferenced_model.las',
];

interface PointCloudResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

// Download and extract point cloud from all.zip
async function extractPointCloud(taskId: string): Promise<PointCloudResult> {
  const nodeODMUrl = getNodeODMUrl();
  const zipUrl = `${nodeODMUrl}/task/${taskId}/download/all.zip`;
  
  console.log(`[PointCloud API] Downloading all.zip from ${zipUrl}`);
  
  // Dynamically import unzipper
  const unzipper = await import('unzipper');
  
  // Download the zip file
  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`Failed to download all.zip: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log(`[PointCloud API] Downloaded ${buffer.length} bytes, extracting...`);
  
  // Parse the zip and find the point cloud
  const directory = await unzipper.Open.buffer(buffer);
  
  let pointcloudEntry: Unzipper.File | null = null;
  let foundPath = '';
  
  for (const pcPath of POINTCLOUD_PATHS) {
    pointcloudEntry = directory.files.find((f: Unzipper.File) => f.path === pcPath) || null;
    if (pointcloudEntry) {
      foundPath = pcPath;
      break;
    }
  }
  
  if (!pointcloudEntry) {
    // List what files are in the zip for debugging
    const fileList = directory.files
      .map((f: Unzipper.File) => f.path)
      .filter((p: string) => p.includes('georef') || p.endsWith('.laz') || p.endsWith('.las') || p.endsWith('.ply'));
    console.log(`[PointCloud API] Available point cloud files: ${fileList.join(', ')}`);
    throw new Error('Georeferenced point cloud not found in all.zip');
  }
  
  console.log(`[PointCloud API] Found point cloud: ${foundPath}`);
  
  // Extract the file
  const pointcloudBuffer = await pointcloudEntry.buffer();
  console.log(`[PointCloud API] Extracted ${pointcloudBuffer.length} bytes`);
  
  // Determine content type and filename
  const ext = path.extname(foundPath).toLowerCase();
  let contentType = 'application/octet-stream';
  const filename = `pointcloud_${taskId}${ext}`;
  
  if (ext === '.laz') {
    contentType = 'application/vnd.laszip';
  } else if (ext === '.las') {
    contentType = 'application/vnd.las';
  } else if (ext === '.ply') {
    contentType = 'application/ply';
  }
  
  return {
    buffer: pointcloudBuffer,
    filename,
    contentType,
  };
}

// GET handler - returns the point cloud file
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { taskId } = await params;
  
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }
  
  // Check for info-only request
  const searchParams = request.nextUrl.searchParams;
  const infoOnly = searchParams.get('info') === 'true';
  
  try {
    await ensureCacheDir();
    
    // Check cache first (check for both .laz and .las)
    for (const ext of ['laz', 'las']) {
      const cachedPath = await getCachedFile(taskId, ext);
      if (cachedPath) {
        console.log(`[PointCloud API] Serving cached file for ${taskId}`);
        
        if (infoOnly) {
          const stats = await fs.stat(cachedPath);
          return NextResponse.json({
            available: true,
            filename: `pointcloud_${taskId}.${ext}`,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            cached: true,
          });
        }
        
        const data = await fs.readFile(cachedPath);
        const contentType = ext === 'laz' ? 'application/vnd.laszip' : 'application/vnd.las';
        
        return new NextResponse(new Uint8Array(data), {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="pointcloud_${taskId}.${ext}"`,
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'HIT',
          },
        });
      }
    }
    
    // Extract point cloud
    console.log(`[PointCloud API] Processing point cloud for ${taskId}`);
    const result = await extractPointCloud(taskId);
    
    // Cache the result
    const ext = result.filename.split('.').pop() || 'laz';
    const cachePath = path.join(CACHE_DIR, `${taskId}.${ext}`);
    await fs.writeFile(cachePath, result.buffer);
    console.log(`[PointCloud API] Cached to ${cachePath}`);
    
    if (infoOnly) {
      return NextResponse.json({
        available: true,
        filename: result.filename,
        size: result.buffer.length,
        sizeFormatted: formatBytes(result.buffer.length),
        cached: false,
      });
    }
    
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error(`[PointCloud API] Error:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    if (infoOnly) {
      return NextResponse.json({
        available: false,
        error: message,
      });
    }
    
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

// Point cloud files to search for in all.zip, in order of preference
const POINTCLOUD_ZIP_PATHS = [
  'odm_georeferencing/odm_georeferenced_model.laz',
  'odm_georeferencing/odm_georeferenced_model.las',
  'georeferenced_model.laz',
  'georeferenced_model.las',
];

// Assets NodeODM can serve directly without downloading the whole all.zip
const POINTCLOUD_DIRECT_ASSETS = [
  'odm_georeferencing/odm_georeferenced_model.laz',
  'odm_georeferencing/odm_georeferenced_model.las',
];
interface PointCloudResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  format: string;
}

function describePointCloud(filename: string): { contentType: string; format: string } {
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === '.laz' ? 'application/vnd.laszip' :
    ext === '.las' ? 'application/vnd.las' :
    ext === '.ply' ? 'application/ply' :
    'application/octet-stream';
  return { contentType, format: ext.replace('.', '') };
}

// Download and extract point cloud from all.zip
async function extractPointCloud(taskId: string): Promise<PointCloudResult> {
  const nodeODMUrl = getNodeODMUrl();

  // Try fetching the point cloud directly from the task output first —
  // this avoids downloading the entire all.zip
  for (const asset of POINTCLOUD_DIRECT_ASSETS) {
    try {
      const response = await fetch(`${nodeODMUrl}/task/${taskId}/download/${asset}`);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        console.log(`[PointCloud API] Fetched ${asset} directly (${buffer.length} bytes)`);
        return {
          buffer,
          filename: `pointcloud_${taskId}${path.extname(asset)}`,
          ...describePointCloud(asset),
        };
      }
    } catch {
      // NodeODM unreachable or asset not served directly — fall through to all.zip
    }
  }

  const zipUrl = `${nodeODMUrl}/task/${taskId}/download/all.zip`;
  console.log(`[PointCloud API] Falling back to ${zipUrl}`);

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

  for (const pcPath of POINTCLOUD_ZIP_PATHS) {
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

  return {
    buffer: pointcloudBuffer,
    filename: `pointcloud_${taskId}${path.extname(foundPath)}`,
    ...describePointCloud(foundPath),
  };
}


// A view over decoded points: index-based dimension getters with scale/offset applied
type PointView = {
  pointCount: number;
  dimensions: { [name: string]: unknown };
  getter: (name: string) => (index: number) => number;
};

type PointPart = {
  view: PointView;
  limit: number;
  zMin: number;
  zMax: number;
};

// Copy up to `limit` points from a view into the output arrays (already centered/axis-swapped space).
// Returns the updated number of written points.
function extractPoints(
  view: PointView,
  limit: number,
  zMin: number,
  zMax: number,
  center: [number, number, number],
  positions: Float32Array,
  colors: Uint8Array,
  written: number,
): number {
  const getX = view.getter('X');
  const getY = view.getter('Y');
  const getZ = view.getter('Z');
  const getRed = view.dimensions.Red !== undefined ? view.getter('Red') : null;
  const getGreen = view.dimensions.Green !== undefined ? view.getter('Green') : null;
  const getBlue = view.dimensions.Blue !== undefined ? view.getter('Blue') : null;

  const zRange = Math.max(zMax - zMin, 1e-6);
  const count = Math.min(view.pointCount, limit);

  for (let i = 0; i < count; i++) {
    const x = getX(i);
    const y = getY(i);
    const z = getZ(i);

    // Center on the cloud and swap Y/Z for the Three.js (Y-up) coordinate system
    positions[written * 3] = x - center[0];
    positions[written * 3 + 1] = z - center[2];
    positions[written * 3 + 2] = -(y - center[1]);

    if (getRed && getGreen && getBlue) {
      const r = getRed(i);
      const g = getGreen(i);
      const b = getBlue(i);
      // LAS stores 16-bit RGB; some writers store 8-bit values — scale by magnitude
      if (r > 255 || g > 255 || b > 255) {
        colors[written * 3] = Math.floor(r / 256);
        colors[written * 3 + 1] = Math.floor(g / 256);
        colors[written * 3 + 2] = Math.floor(b / 256);
      } else {
        colors[written * 3] = r;
        colors[written * 3 + 1] = g;
        colors[written * 3 + 2] = b;
      }
    } else {
      // Height-based fallback color (blue low, red high)
      const t = (z - zMin) / zRange;
      colors[written * 3] = Math.floor(t * 255);
      colors[written * 3 + 1] = Math.floor((1 - t) * 200 + 55);
      colors[written * 3 + 2] = Math.floor((1 - t) * 255);
    }
    written++;
  }

  return written;
}

// Convert LAS/LAZ points to a binary format for Three.js (positions + colors)
// For LAZ files, we need to pass the cached file path so copc can read it
async function convertToPoints(
  buffer: Buffer,
  format: string,
  maxPoints: number = 500000,
  cachedFilePath?: string,
): Promise<{ positions: Float32Array; colors: Uint8Array; pointCount: number }> {
  const copc = await import('copc');
  const include = ['X', 'Y', 'Z', 'Red', 'Green', 'Blue'];
  const parts: PointPart[] = [];
  let center: [number, number, number] = [0, 0, 0];

  if (format === 'laz') {
    if (!cachedFilePath) {
      throw new Error('LAZ decompression requires a cached file path');
    }

    console.log('[PointCloud API] Reading LAZ from:', cachedFilePath);
    const getter = copc.Getter.create(cachedFilePath);

    // Try COPC first (sparse octree hierarchy, one node view per level)
    let copcData: Awaited<ReturnType<typeof copc.Copc.create>> | null = null;
    try {
      copcData = await copc.Copc.create(getter);
    } catch {
      copcData = null;
    }

    if (copcData) {
      const header = copcData.header;
      console.log(`[PointCloud API] COPC file: ${header.pointCount} total points`);
      const subtree = await copc.Copc.loadHierarchyPage(getter, copcData.info.rootHierarchyPage);
      // Coarse levels first ("depth-x-y-z" keys) so the overall shape appears early
      const nodes = Object.entries(subtree.nodes)
        .filter(([, node]) => node && node.pointCount > 0)
        .sort((a, b) => parseInt(a[0].split('-')[0], 10) - parseInt(b[0].split('-')[0], 10));

      if (nodes.length === 0) {
        throw new Error('No nodes found in COPC hierarchy');
      }

      center = [
        (header.min[0] + header.max[0]) / 2,
        (header.min[1] + header.max[1]) / 2,
        (header.min[2] + header.max[2]) / 2,
      ];

      let remaining = maxPoints;
      for (const [, node] of nodes) {
        if (remaining <= 0) break;
        const view = await copc.Copc.loadPointDataView(getter, copcData, node, { include });
        const limit = Math.min(view.pointCount, remaining);
        parts.push({ view, limit, zMin: header.min[2], zMax: header.max[2] });
        remaining -= limit;
      }
    } else {
      // Plain LAZ: decompress the whole file, then build a single view
      const file = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const header = copc.Las.Header.parse(file);
      console.log(`[PointCloud API] LAS/LAZ file: ${header.pointCount} points, format ${header.pointDataRecordFormat}`);

      const decompressed = await copc.Las.PointData.decompressFile(file);
      console.log(`[PointCloud API] Decompressed to ${decompressed.length} bytes`);

      const view = copc.Las.View.create(decompressed, header);
      parts.push({
        view,
        limit: Math.min(view.pointCount, maxPoints),
        zMin: header.min[2],
        zMax: header.max[2],
      });
      center = [
        (header.min[0] + header.max[0]) / 2,
        (header.min[1] + header.max[1]) / 2,
        (header.min[2] + header.max[2]) / 2,
      ];
    }
  } else {
    // Uncompressed LAS: point records start at pointDataOffset
    const file = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const header = copc.Las.Header.parse(file);
    console.log(`[PointCloud API] LAS file: ${header.pointCount} points, format ${header.pointDataRecordFormat}`);

    const view = copc.Las.View.create(file.subarray(header.pointDataOffset), header);
    parts.push({
      view,
      limit: Math.min(view.pointCount, maxPoints),
      zMin: header.min[2],
      zMax: header.max[2],
    });
    center = [
      (header.min[0] + header.max[0]) / 2,
      (header.min[1] + header.max[1]) / 2,
      (header.min[2] + header.max[2]) / 2,
    ];
  }

  const pointCount = parts.reduce((sum, part) => sum + part.limit, 0);
  const positions = new Float32Array(pointCount * 3);
  const colors = new Uint8Array(pointCount * 3);

  let written = 0;
  for (const part of parts) {
    written = extractPoints(part.view, part.limit, part.zMin, part.zMax, center, positions, colors, written);
  }

  console.log(`[PointCloud API] Extracted ${written} points`);
  return { positions, colors, pointCount: written };
}

// GET handler - returns the point cloud file
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { taskId } = await params;
  
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }
  
  // Check request type
  const searchParams = request.nextUrl.searchParams;
  const infoOnly = searchParams.get('info') === 'true';
  const outputFormat = searchParams.get('format'); // 'points' for Three.js binary format
  const parsedMaxPoints = parseInt(searchParams.get('maxPoints') || '500000', 10);
  const maxPoints = Number.isFinite(parsedMaxPoints) && parsedMaxPoints > 0
    ? Math.min(parsedMaxPoints, 10_000_000)
    : 500000;
  
  try {
    await ensureCacheDir();
    
    // Check cache first (check for both .laz and .las)
    let cachedPath: string | null = null;
    let cachedExt = '';
    for (const ext of ['laz', 'las']) {
      cachedPath = await getCachedFile(taskId, ext);
      if (cachedPath) {
        cachedExt = ext;
        break;
      }
    }
    
    // For points format, check if we have cached binary points
    if (outputFormat === 'points') {
      const pointsCachePath = await getCachedFile(taskId, `${maxPoints}.points.bin`);
      if (pointsCachePath) {
        console.log(`[PointCloud API] Serving cached points for ${taskId}`);
        const data = await fs.readFile(pointsCachePath);
        return new NextResponse(new Uint8Array(data), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'HIT',
          },
        });
      }
    }
    
    let result: PointCloudResult;
    let lazFilePath: string | null = null;
    
    if (cachedPath) {
      console.log(`[PointCloud API] Using cached LAZ/LAS for ${taskId}`);
      const data = await fs.readFile(cachedPath);
      result = {
        buffer: data,
        filename: `pointcloud_${taskId}.${cachedExt}`,
        contentType: cachedExt === 'laz' ? 'application/vnd.laszip' : 'application/vnd.las',
        format: cachedExt,
      };
      lazFilePath = cachedPath;
      
      if (infoOnly) {
        const stats = await fs.stat(cachedPath);
        return NextResponse.json({
          available: true,
          filename: result.filename,
          format: cachedExt,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          cached: true,
        });
      }
    } else {
      // Extract point cloud from all.zip
      console.log(`[PointCloud API] Processing point cloud for ${taskId}`);
      result = await extractPointCloud(taskId);
      
      // Cache the LAZ/LAS file
      const ext = result.filename.split('.').pop() || 'laz';
      lazFilePath = path.join(CACHE_DIR, `${taskId}.${ext}`);
      await fs.writeFile(lazFilePath, result.buffer);
      console.log(`[PointCloud API] Cached LAZ/LAS to ${lazFilePath}`);
      
      if (infoOnly) {
        return NextResponse.json({
          available: true,
          filename: result.filename,
          format: result.format,
          size: result.buffer.length,
          sizeFormatted: formatBytes(result.buffer.length),
          cached: false,
        });
      }
    }
    
    // If requesting points format for Three.js
    if (outputFormat === 'points') {
      console.log(`[PointCloud API] Converting to points format...`);
      const { positions, colors, pointCount } = await convertToPoints(result.buffer, result.format, maxPoints, lazFilePath || undefined);
      
      // Create binary buffer: [pointCount (4 bytes)] + [positions (pointCount * 12 bytes)] + [colors (pointCount * 3 bytes)]
      const headerSize = 4;
      const positionsSize = positions.byteLength;
      const colorsSize = colors.byteLength;
      const totalSize = headerSize + positionsSize + colorsSize;
      
      const outputBuffer = new ArrayBuffer(totalSize);
      const outputView = new DataView(outputBuffer);
      
      // Write point count
      outputView.setUint32(0, pointCount, true);
      
      // Write positions
      new Uint8Array(outputBuffer, headerSize, positionsSize).set(new Uint8Array(positions.buffer));
      
      // Write colors
      new Uint8Array(outputBuffer, headerSize + positionsSize, colorsSize).set(colors);
      
      // Cache the points
      const pointsCachePath = path.join(CACHE_DIR, `${taskId}.${maxPoints}.points.bin`);
      await fs.writeFile(pointsCachePath, Buffer.from(outputBuffer));
      console.log(`[PointCloud API] Cached points to ${pointsCachePath}`);
      
      return new NextResponse(new Uint8Array(outputBuffer), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'MISS',
          'X-Point-Count': pointCount.toString(),
        },
      });
    }
    
    // Return raw LAZ/LAS file
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': cachedPath ? 'HIT' : 'MISS',
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

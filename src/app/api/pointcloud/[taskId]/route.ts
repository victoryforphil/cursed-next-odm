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
  format: string;
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
  let format = ext.replace('.', '');
  
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
    format,
  };
}

// Parse LAS/LAZ header to get point count and format info
interface LASHeader {
  pointCount: number;
  pointDataFormat: number;
  pointDataRecordLength: number;
  offsetToPointData: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function parseLASHeader(buffer: Buffer): LASHeader {
  // LAS file format header
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  return {
    pointDataFormat: view.getUint8(104),
    pointDataRecordLength: view.getUint16(105, true),
    pointCount: view.getUint32(107, true), // Legacy point count
    offsetToPointData: view.getUint32(96, true),
    scaleX: view.getFloat64(131, true),
    scaleY: view.getFloat64(139, true),
    scaleZ: view.getFloat64(147, true),
    offsetX: view.getFloat64(155, true),
    offsetY: view.getFloat64(163, true),
    offsetZ: view.getFloat64(171, true),
    minX: view.getFloat64(187, true),
    minY: view.getFloat64(203, true),
    minZ: view.getFloat64(219, true),
    maxX: view.getFloat64(179, true),
    maxY: view.getFloat64(195, true),
    maxZ: view.getFloat64(211, true),
  };
}

// Convert LAS points to a binary format for Three.js (positions + colors)
async function convertToPoints(buffer: Buffer, format: string, maxPoints: number = 500000): Promise<{ positions: Float32Array; colors: Uint8Array; pointCount: number }> {
  let lasBuffer = buffer;
  
  // If LAZ, decompress first using copc library
  if (format === 'laz') {
    console.log('[PointCloud API] Decompressing LAZ...');
    try {
      const copc = await import('copc');
      // For LAZ files, we use the Las.PointData to decompress
      const getter = copc.Getter.create(buffer);
      
      // Try to read as COPC first, if it fails, use regular LAZ decompression
      try {
        const header = await copc.Copc.loadHeader(getter);
        const hierarchy = await copc.Copc.loadHierarchy(getter, header.header);
        
        // Get root node points
        const rootKey = '0-0-0-0';
        const rootNode = hierarchy.nodes[rootKey];
        if (rootNode) {
          const view = await copc.Copc.loadPointDataView(getter, header.header, rootNode);
          const pointCount = Math.min(view.pointCount, maxPoints);
          
          const positions = new Float32Array(pointCount * 3);
          const colors = new Uint8Array(pointCount * 3);
          
          // Get dimensions
          const xDim = view.getDimension('X');
          const yDim = view.getDimension('Y');
          const zDim = view.getDimension('Z');
          const redDim = view.getDimension('Red');
          const greenDim = view.getDimension('Green');
          const blueDim = view.getDimension('Blue');
          
          // Calculate center for centering the point cloud
          let sumX = 0, sumY = 0, sumZ = 0;
          for (let i = 0; i < pointCount; i++) {
            sumX += xDim.getter(i);
            sumY += yDim.getter(i);
            sumZ += zDim.getter(i);
          }
          const centerX = sumX / pointCount;
          const centerY = sumY / pointCount;
          const centerZ = sumZ / pointCount;
          
          for (let i = 0; i < pointCount; i++) {
            positions[i * 3] = xDim.getter(i) - centerX;
            positions[i * 3 + 1] = zDim.getter(i) - centerZ; // Swap Y and Z for Three.js
            positions[i * 3 + 2] = -(yDim.getter(i) - centerY);
            
            if (redDim && greenDim && blueDim) {
              // LAS colors are 16-bit, scale to 8-bit
              colors[i * 3] = Math.floor(redDim.getter(i) / 256);
              colors[i * 3 + 1] = Math.floor(greenDim.getter(i) / 256);
              colors[i * 3 + 2] = Math.floor(blueDim.getter(i) / 256);
            } else {
              // Default gray color
              colors[i * 3] = 128;
              colors[i * 3 + 1] = 128;
              colors[i * 3 + 2] = 128;
            }
          }
          
          console.log(`[PointCloud API] Extracted ${pointCount} points from COPC`);
          return { positions, colors, pointCount };
        }
      } catch {
        // Not a COPC file, continue with regular processing
      }
      
      // Fall back to regular LAZ processing
      throw new Error('Regular LAZ decompression not fully implemented - install las-js for full support');
    } catch (e) {
      console.error('[PointCloud API] LAZ decompression error:', e);
      throw new Error(`LAZ decompression failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }
  
  // Parse LAS file
  const header = parseLASHeader(lasBuffer);
  console.log(`[PointCloud API] LAS header: ${header.pointCount} points, format ${header.pointDataFormat}`);
  
  const pointCount = Math.min(header.pointCount, maxPoints);
  const positions = new Float32Array(pointCount * 3);
  const colors = new Uint8Array(pointCount * 3);
  
  const view = new DataView(lasBuffer.buffer, lasBuffer.byteOffset, lasBuffer.byteLength);
  const recordLength = header.pointDataRecordLength;
  
  // Calculate center for centering the point cloud
  const centerX = (header.minX + header.maxX) / 2;
  const centerY = (header.minY + header.maxY) / 2;
  const centerZ = (header.minZ + header.maxZ) / 2;
  
  // Determine if format has RGB (formats 2, 3, 5, 7, 8, 10)
  const hasRGB = [2, 3, 5, 7, 8, 10].includes(header.pointDataFormat);
  const rgbOffset = header.pointDataFormat <= 5 ? 20 : 28; // Approximate offset
  
  for (let i = 0; i < pointCount; i++) {
    const offset = header.offsetToPointData + i * recordLength;
    
    // Read X, Y, Z as 32-bit integers and apply scale/offset
    const x = view.getInt32(offset, true) * header.scaleX + header.offsetX;
    const y = view.getInt32(offset + 4, true) * header.scaleY + header.offsetY;
    const z = view.getInt32(offset + 8, true) * header.scaleZ + header.offsetZ;
    
    // Center and swap Y/Z for Three.js coordinate system
    positions[i * 3] = x - centerX;
    positions[i * 3 + 1] = z - centerZ;
    positions[i * 3 + 2] = -(y - centerY);
    
    if (hasRGB && offset + rgbOffset + 6 <= lasBuffer.length) {
      // Read RGB as 16-bit values, scale to 8-bit
      const r = view.getUint16(offset + rgbOffset, true);
      const g = view.getUint16(offset + rgbOffset + 2, true);
      const b = view.getUint16(offset + rgbOffset + 4, true);
      colors[i * 3] = Math.floor(r / 256);
      colors[i * 3 + 1] = Math.floor(g / 256);
      colors[i * 3 + 2] = Math.floor(b / 256);
    } else {
      // Default color based on height
      const normalizedZ = (z - header.minZ) / (header.maxZ - header.minZ);
      colors[i * 3] = Math.floor(normalizedZ * 255);
      colors[i * 3 + 1] = Math.floor((1 - normalizedZ) * 200 + 55);
      colors[i * 3 + 2] = Math.floor((1 - normalizedZ) * 255);
    }
  }
  
  console.log(`[PointCloud API] Extracted ${pointCount} points`);
  return { positions, colors, pointCount };
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
  const maxPoints = parseInt(searchParams.get('maxPoints') || '500000', 10);
  
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
      const pointsCachePath = await getCachedFile(taskId, 'points.bin');
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
    
    if (cachedPath) {
      console.log(`[PointCloud API] Using cached LAZ/LAS for ${taskId}`);
      const data = await fs.readFile(cachedPath);
      result = {
        buffer: data,
        filename: `pointcloud_${taskId}.${cachedExt}`,
        contentType: cachedExt === 'laz' ? 'application/vnd.laszip' : 'application/vnd.las',
        format: cachedExt,
      };
      
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
      const cachePath = path.join(CACHE_DIR, `${taskId}.${ext}`);
      await fs.writeFile(cachePath, result.buffer);
      console.log(`[PointCloud API] Cached LAZ/LAS to ${cachePath}`);
      
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
      const { positions, colors, pointCount } = await convertToPoints(result.buffer, result.format, maxPoints);
      
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
      const pointsCachePath = path.join(CACHE_DIR, `${taskId}.points.bin`);
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

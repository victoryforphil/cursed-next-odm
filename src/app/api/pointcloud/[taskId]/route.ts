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

// Convert LAS/LAZ points to a binary format for Three.js (positions + colors)
// For LAZ files, we need to pass the cached file path so copc can read it
async function convertToPoints(buffer: Buffer, format: string, maxPoints: number = 500000, cachedFilePath?: string): Promise<{ positions: Float32Array; colors: Uint8Array; pointCount: number }> {
  // If LAZ, decompress using copc library (requires file path)
  if (format === 'laz') {
    if (!cachedFilePath) {
      throw new Error('LAZ decompression requires a cached file path');
    }
    
    console.log('[PointCloud API] Decompressing LAZ from:', cachedFilePath);
    try {
      const copc = await import('copc');
      
      // Create a file getter using the cached path
      const getter = copc.Getter.create(cachedFilePath);
      
      // Try to read as COPC first
      try {
        const copcData = await copc.Copc.create(getter);
        const { header, info } = copcData;
        
        console.log(`[PointCloud API] COPC file: ${header.pointCount} total points`);
        
        // Get all nodes from the hierarchy
        const nodes = await copc.Copc.loadHierarchyPage(getter, copcData);
        const allNodes = Object.values(nodes.nodes);
        
        if (allNodes.length === 0) {
          throw new Error('No nodes found in COPC hierarchy');
        }
        
        // Sort nodes by depth (root first) and collect points up to maxPoints
        allNodes.sort((a, b) => {
          const depthA = a.key?.split('-')[0] || '0';
          const depthB = b.key?.split('-')[0] || '0';
          return parseInt(depthA) - parseInt(depthB);
        });
        
        let totalPoints = 0;
        const allPositions: number[] = [];
        const allColors: number[] = [];
        
        for (const node of allNodes) {
          if (totalPoints >= maxPoints) break;
          if (!node.pointCount) continue;
          
          const view = await copc.Copc.loadPointDataView(getter, copcData, node);
          const pointsToRead = Math.min(view.pointCount, maxPoints - totalPoints);
          
          const xDim = view.getter('X');
          const yDim = view.getter('Y');
          const zDim = view.getter('Z');
          const redDim = view.getter('Red');
          const greenDim = view.getter('Green');
          const blueDim = view.getter('Blue');
          
          for (let i = 0; i < pointsToRead; i++) {
            allPositions.push(xDim(i), yDim(i), zDim(i));
            if (redDim && greenDim && blueDim) {
              allColors.push(
                Math.floor(redDim(i) / 256),
                Math.floor(greenDim(i) / 256),
                Math.floor(blueDim(i) / 256)
              );
            } else {
              allColors.push(128, 128, 128);
            }
          }
          totalPoints += pointsToRead;
        }
        
        // Calculate center for centering
        let sumX = 0, sumY = 0, sumZ = 0;
        for (let i = 0; i < totalPoints; i++) {
          sumX += allPositions[i * 3];
          sumY += allPositions[i * 3 + 1];
          sumZ += allPositions[i * 3 + 2];
        }
        const centerX = sumX / totalPoints;
        const centerY = sumY / totalPoints;
        const centerZ = sumZ / totalPoints;
        
        // Create output arrays with centered coordinates and Y/Z swap
        const positions = new Float32Array(totalPoints * 3);
        const colors = new Uint8Array(totalPoints * 3);
        
        for (let i = 0; i < totalPoints; i++) {
          positions[i * 3] = allPositions[i * 3] - centerX;
          positions[i * 3 + 1] = allPositions[i * 3 + 2] - centerZ; // Swap Y and Z
          positions[i * 3 + 2] = -(allPositions[i * 3 + 1] - centerY);
          
          colors[i * 3] = allColors[i * 3];
          colors[i * 3 + 1] = allColors[i * 3 + 1];
          colors[i * 3 + 2] = allColors[i * 3 + 2];
        }
        
        console.log(`[PointCloud API] Extracted ${totalPoints} points from COPC`);
        return { positions, colors, pointCount: totalPoints };
        
      } catch (copcError) {
        console.log('[PointCloud API] Not a COPC file, trying as regular LAZ...');
        
        // Try reading as regular LAS/LAZ using Las module
        try {
          const las = await copc.Las.create(getter);
          const { header } = las;
          
          console.log(`[PointCloud API] LAS/LAZ file: ${header.pointCount} points, format ${header.pointDataRecordFormat}`);
          
          const pointCount = Math.min(header.pointCount, maxPoints);
          const view = await copc.Las.View.create(getter, las, 0, pointCount);
          
          const xDim = view.getter('X');
          const yDim = view.getter('Y');
          const zDim = view.getter('Z');
          const redDim = view.getter('Red');
          const greenDim = view.getter('Green');
          const blueDim = view.getter('Blue');
          
          // Calculate center
          let sumX = 0, sumY = 0, sumZ = 0;
          for (let i = 0; i < pointCount; i++) {
            sumX += xDim(i);
            sumY += yDim(i);
            sumZ += zDim(i);
          }
          const centerX = sumX / pointCount;
          const centerY = sumY / pointCount;
          const centerZ = sumZ / pointCount;
          
          const positions = new Float32Array(pointCount * 3);
          const colors = new Uint8Array(pointCount * 3);
          
          for (let i = 0; i < pointCount; i++) {
            positions[i * 3] = xDim(i) - centerX;
            positions[i * 3 + 1] = zDim(i) - centerZ; // Swap Y and Z
            positions[i * 3 + 2] = -(yDim(i) - centerY);
            
            if (redDim && greenDim && blueDim) {
              colors[i * 3] = Math.floor(redDim(i) / 256);
              colors[i * 3 + 1] = Math.floor(greenDim(i) / 256);
              colors[i * 3 + 2] = Math.floor(blueDim(i) / 256);
            } else {
              // Default color based on normalized height
              const normalizedZ = (zDim(i) - header.min[2]) / (header.max[2] - header.min[2]);
              colors[i * 3] = Math.floor(normalizedZ * 255);
              colors[i * 3 + 1] = Math.floor((1 - normalizedZ) * 200 + 55);
              colors[i * 3 + 2] = Math.floor((1 - normalizedZ) * 255);
            }
          }
          
          console.log(`[PointCloud API] Extracted ${pointCount} points from LAZ`);
          return { positions, colors, pointCount };
          
        } catch (lasError) {
          throw new Error(`Failed to read LAZ: ${lasError instanceof Error ? lasError.message : 'Unknown error'}`);
        }
      }
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

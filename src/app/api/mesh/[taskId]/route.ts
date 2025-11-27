import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type * as Unzipper from 'unzipper';

// Cache directory for extracted meshes
const CACHE_DIR = path.join(os.tmpdir(), 'odm-mesh-cache');

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

// Mesh file paths to search for in order of preference
const MESH_PATHS = [
  // Textured mesh OBJ (most common format, Three.js compatible)
  'odm_texturing/odm_textured_model_geo.obj',
  'odm_texturing/odm_textured_model.obj',
  // GLB/GLTF (best for web viewing)
  'odm_texturing/odm_textured_model_geo.glb',
  'odm_texturing/odm_textured_model.glb',
  // PLY format
  'odm_meshing/odm_mesh.ply',
  // Alternative locations
  'textured_model.obj',
  'mesh.ply',
];

// Texture file paths to search for
const TEXTURE_PATHS = [
  'odm_texturing/odm_textured_model_geo_material0000_map_Kd.png',
  'odm_texturing/odm_textured_model_geo_material0000_map_Kd.jpg',
  'odm_texturing/odm_textured_model_material0000_map_Kd.png',
  'odm_texturing/odm_textured_model_material0000_map_Kd.jpg',
];

// MTL file paths
const MTL_PATHS = [
  'odm_texturing/odm_textured_model_geo.mtl',
  'odm_texturing/odm_textured_model.mtl',
];

interface MeshResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  format: string;
}

// Download and extract mesh from all.zip
async function extractMesh(taskId: string, fileType: 'mesh' | 'texture' | 'mtl' = 'mesh'): Promise<MeshResult> {
  const nodeODMUrl = getNodeODMUrl();
  const zipUrl = `${nodeODMUrl}/task/${taskId}/download/all.zip`;
  
  console.log(`[Mesh API] Downloading all.zip from ${zipUrl}`);
  
  const unzipper = await import('unzipper');
  
  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`Failed to download all.zip: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log(`[Mesh API] Downloaded ${buffer.length} bytes, extracting...`);
  
  const directory = await unzipper.Open.buffer(buffer);
  
  // Determine which paths to search based on file type
  let searchPaths: string[];
  if (fileType === 'texture') {
    searchPaths = TEXTURE_PATHS;
  } else if (fileType === 'mtl') {
    searchPaths = MTL_PATHS;
  } else {
    searchPaths = MESH_PATHS;
  }
  
  let meshEntry: Unzipper.File | null = null;
  let foundPath = '';
  
  for (const meshPath of searchPaths) {
    meshEntry = directory.files.find((f: Unzipper.File) => f.path === meshPath) || null;
    if (meshEntry) {
      foundPath = meshPath;
      break;
    }
  }
  
  if (!meshEntry) {
    const typeLabel = fileType === 'texture' ? 'Texture' : fileType === 'mtl' ? 'MTL' : 'Mesh';
    const fileList = directory.files
      .map((f: Unzipper.File) => f.path)
      .filter((p: string) => 
        p.includes('mesh') || 
        p.includes('textur') || 
        p.endsWith('.obj') || 
        p.endsWith('.ply') || 
        p.endsWith('.glb') ||
        p.endsWith('.mtl') ||
        (fileType === 'texture' && (p.endsWith('.png') || p.endsWith('.jpg')))
      );
    console.log(`[Mesh API] Available ${typeLabel.toLowerCase()} files: ${fileList.join(', ')}`);
    throw new Error(`${typeLabel} not found in all.zip`);
  }
  
  console.log(`[Mesh API] Found ${fileType}: ${foundPath}`);
  
  const meshBuffer = await meshEntry.buffer();
  console.log(`[Mesh API] Extracted ${meshBuffer.length} bytes`);
  
  // Determine content type and format
  const ext = path.extname(foundPath).toLowerCase();
  let contentType = 'application/octet-stream';
  let format = 'unknown';
  
  switch (ext) {
    case '.obj':
      contentType = 'text/plain';
      format = 'obj';
      break;
    case '.mtl':
      contentType = 'text/plain';
      format = 'mtl';
      break;
    case '.ply':
      contentType = 'application/ply';
      format = 'ply';
      break;
    case '.glb':
      contentType = 'model/gltf-binary';
      format = 'glb';
      break;
    case '.gltf':
      contentType = 'model/gltf+json';
      format = 'gltf';
      break;
    case '.png':
      contentType = 'image/png';
      format = 'png';
      break;
    case '.jpg':
    case '.jpeg':
      contentType = 'image/jpeg';
      format = 'jpg';
      break;
  }
  
  const filename = `${fileType}_${taskId}${ext}`;
  
  return {
    buffer: meshBuffer,
    filename,
    contentType,
    format,
  };
}

// GET handler - returns the mesh file
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { taskId } = await params;
  
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const infoOnly = searchParams.get('info') === 'true';
  const fileType = (searchParams.get('type') as 'mesh' | 'texture' | 'mtl') || 'mesh';
  
  try {
    await ensureCacheDir();
    
    // Check cache first
    const extensions = fileType === 'texture' ? ['png', 'jpg'] : 
                       fileType === 'mtl' ? ['mtl'] :
                       ['obj', 'ply', 'glb'];
    
    for (const ext of extensions) {
      const cacheKey = `${taskId}_${fileType}`;
      const cachedPath = await getCachedFile(cacheKey, ext);
      if (cachedPath) {
        console.log(`[Mesh API] Serving cached ${fileType} for ${taskId}`);
        
        if (infoOnly) {
          const stats = await fs.stat(cachedPath);
          return NextResponse.json({
            available: true,
            filename: `${fileType}_${taskId}.${ext}`,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            format: ext,
            cached: true,
          });
        }
        
        const data = await fs.readFile(cachedPath);
        const contentType = getContentType(ext);
        
        return new NextResponse(new Uint8Array(data), {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${fileType}_${taskId}.${ext}"`,
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'HIT',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }
    
    // Extract mesh
    console.log(`[Mesh API] Processing ${fileType} for ${taskId}`);
    const result = await extractMesh(taskId, fileType);
    
    // Cache the result
    const cacheKey = `${taskId}_${fileType}`;
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.${result.format}`);
    await fs.writeFile(cachePath, result.buffer);
    console.log(`[Mesh API] Cached to ${cachePath}`);
    
    if (infoOnly) {
      return NextResponse.json({
        available: true,
        filename: result.filename,
        size: result.buffer.length,
        sizeFormatted: formatBytes(result.buffer.length),
        format: result.format,
        cached: false,
      });
    }
    
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `inline; filename="${result.filename}"`,
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error(`[Mesh API] Error:`, error);
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

function getContentType(ext: string): string {
  switch (ext) {
    case 'obj': return 'text/plain';
    case 'mtl': return 'text/plain';
    case 'ply': return 'application/ply';
    case 'glb': return 'model/gltf-binary';
    case 'png': return 'image/png';
    case 'jpg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

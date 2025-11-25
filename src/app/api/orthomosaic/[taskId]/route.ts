import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type * as Unzipper from 'unzipper';

// Cache directory for extracted orthomosaics
const CACHE_DIR = path.join(os.tmpdir(), 'odm-orthomosaic-cache');

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Get the NodeODM base URL from environment or default
function getNodeODMUrl(): string {
  return process.env.NODEODM_URL || 'http://localhost:3001';
}

// Check if cached file exists and is recent (less than 1 hour old)
async function getCachedFile(taskId: string): Promise<string | null> {
  const cachedPath = path.join(CACHE_DIR, `${taskId}.png`);
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

// Download and extract orthomosaic from all.zip
async function extractOrthomosaic(taskId: string): Promise<Buffer> {
  const nodeODMUrl = getNodeODMUrl();
  const zipUrl = `${nodeODMUrl}/task/${taskId}/download/all.zip`;
  
  console.log(`[Orthomosaic API] Downloading all.zip from ${zipUrl}`);
  
  // Dynamically import unzipper
  const unzipper = await import('unzipper');
  
  // Download the zip file
  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`Failed to download all.zip: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log(`[Orthomosaic API] Downloaded ${buffer.length} bytes, extracting...`);
  
  // Parse the zip and find the orthophoto
  const directory = await unzipper.Open.buffer(buffer);
  
  // Look for orthophoto files in order of preference
  const orthoPaths = [
    'odm_orthophoto/odm_orthophoto.png',
    'odm_orthophoto/odm_orthophoto.tif',
    'odm_orthophoto/odm_orthophoto.jpg',
  ];
  
  let orthophotoEntry: unzipper.File | null = null;
  let foundPath = '';
  
  for (const orthoPath of orthoPaths) {
    orthophotoEntry = directory.files.find(f => f.path === orthoPath) || null;
    if (orthophotoEntry) {
      foundPath = orthoPath;
      break;
    }
  }
  
  if (!orthophotoEntry) {
    // List what files are in the zip for debugging
    const fileList = directory.files.map(f => f.path).filter(p => p.includes('ortho'));
    console.log(`[Orthomosaic API] Available ortho files: ${fileList.join(', ')}`);
    throw new Error('Orthophoto not found in all.zip');
  }
  
  console.log(`[Orthomosaic API] Found orthophoto: ${foundPath}`);
  
  // Extract the file
  const orthophotoBuffer = await orthophotoEntry.buffer();
  console.log(`[Orthomosaic API] Extracted ${orthophotoBuffer.length} bytes`);
  
  // If it's a TIFF, convert to PNG using sharp
  if (foundPath.endsWith('.tif') || foundPath.endsWith('.tiff')) {
    console.log(`[Orthomosaic API] Converting TIFF to PNG...`);
    const sharp = (await import('sharp')).default;
    
    try {
      const pngBuffer = await sharp(orthophotoBuffer)
        .png({ quality: 90, compressionLevel: 6 })
        .toBuffer();
      console.log(`[Orthomosaic API] Converted to PNG: ${pngBuffer.length} bytes`);
      return pngBuffer;
    } catch (sharpError) {
      console.error(`[Orthomosaic API] Sharp conversion failed:`, sharpError);
      
      // Try using geotiff.js as fallback for GeoTIFF
      console.log(`[Orthomosaic API] Trying geotiff.js fallback...`);
      const GeoTIFF = await import('geotiff');
      const tiff = await GeoTIFF.fromArrayBuffer(orthophotoBuffer.buffer.slice(
        orthophotoBuffer.byteOffset,
        orthophotoBuffer.byteOffset + orthophotoBuffer.byteLength
      ));
      const image = await tiff.getImage();
      const width = image.getWidth();
      const height = image.getHeight();
      const rasters = await image.readRasters();
      
      // Convert to RGBA
      const rgba = new Uint8ClampedArray(width * height * 4);
      const samplesPerPixel = rasters.length;
      
      for (let i = 0; i < width * height; i++) {
        if (samplesPerPixel >= 3) {
          rgba[i * 4] = (rasters[0] as Uint8Array)[i];     // R
          rgba[i * 4 + 1] = (rasters[1] as Uint8Array)[i]; // G
          rgba[i * 4 + 2] = (rasters[2] as Uint8Array)[i]; // B
          rgba[i * 4 + 3] = samplesPerPixel >= 4 ? (rasters[3] as Uint8Array)[i] : 255; // A
        } else {
          // Grayscale
          const val = (rasters[0] as Uint8Array)[i];
          rgba[i * 4] = val;
          rgba[i * 4 + 1] = val;
          rgba[i * 4 + 2] = val;
          rgba[i * 4 + 3] = 255;
        }
      }
      
      // Use sharp to encode as PNG
      const pngBuffer = await sharp(Buffer.from(rgba.buffer), {
        raw: { width, height, channels: 4 }
      })
        .png({ quality: 90, compressionLevel: 6 })
        .toBuffer();
      
      console.log(`[Orthomosaic API] GeoTIFF converted to PNG: ${pngBuffer.length} bytes`);
      return pngBuffer;
    }
  }
  
  // If it's already PNG or JPG, return as-is or convert to PNG
  if (foundPath.endsWith('.jpg') || foundPath.endsWith('.jpeg')) {
    const sharp = (await import('sharp')).default;
    return await sharp(orthophotoBuffer).png().toBuffer();
  }
  
  return orthophotoBuffer;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { taskId } = await params;
  
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }
  
  try {
    await ensureCacheDir();
    
    // Check cache first
    const cachedPath = await getCachedFile(taskId);
    if (cachedPath) {
      console.log(`[Orthomosaic API] Serving cached file for ${taskId}`);
      const data = await fs.readFile(cachedPath);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'HIT',
        },
      });
    }
    
    // Extract and process orthomosaic
    console.log(`[Orthomosaic API] Processing orthomosaic for ${taskId}`);
    const pngBuffer = await extractOrthomosaic(taskId);
    
    // Cache the result
    const cachePath = path.join(CACHE_DIR, `${taskId}.png`);
    await fs.writeFile(cachePath, pngBuffer);
    console.log(`[Orthomosaic API] Cached to ${cachePath}`);
    
    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error(`[Orthomosaic API] Error:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

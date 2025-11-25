import type { ExifData, ImageFile } from '@/lib/types/nodeodm';

// Convert DMS (degrees, minutes, seconds) to decimal degrees
function dmsToDecimal(dms: number[], ref: string): number {
  const degrees = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return ref === 'S' || ref === 'W' ? -degrees : degrees;
}

export async function extractExifData(file: File): Promise<ExifData | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const dataView = new DataView(arrayBuffer);
      
      // Check for JPEG
      if (dataView.getUint16(0) !== 0xFFD8) {
        resolve(null);
        return;
      }
      
      // Parse standard EXIF
      let exifData = parseExif(dataView);
      
      // Parse XMP for DJI-specific data (DJI Matrice 4E, Mavic, etc.)
      const xmpData = parseXMP(arrayBuffer);
      if (xmpData) {
        exifData = { ...exifData, ...xmpData };
      }
      
      // Calculate heading from gimbal yaw if available
      if (exifData?.gimbalYaw !== undefined) {
        exifData.heading = exifData.gimbalYaw;
      }
      
      resolve(exifData);
    };
    
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 256 * 1024)); // Read first 256KB for EXIF + XMP
  });
}

// Parse XMP metadata (XML embedded in JPEG) - handles DJI drone metadata
function parseXMP(arrayBuffer: ArrayBuffer): Partial<ExifData> | null {
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder('utf-8');
    const text = textDecoder.decode(uint8Array);
    
    // Find XMP packet
    const xmpStart = text.indexOf('<x:xmpmeta');
    const xmpEnd = text.indexOf('</x:xmpmeta>');
    
    if (xmpStart === -1 || xmpEnd === -1) {
      return null;
    }
    
    const xmpString = text.substring(xmpStart, xmpEnd + 12);
    const result: Partial<ExifData> = {};
    
    // DJI-specific XMP tags (drone namespace)
    // These are used by DJI Matrice 4E, Mavic series, Phantom series, etc.
    
    // Gimbal orientation
    const gimbalYaw = extractXMPValue(xmpString, 'drone-dji:GimbalYawDegree') 
                   || extractXMPValue(xmpString, 'drone:GimbalYawDegree');
    if (gimbalYaw !== null) result.gimbalYaw = gimbalYaw;
    
    const gimbalPitch = extractXMPValue(xmpString, 'drone-dji:GimbalPitchDegree')
                     || extractXMPValue(xmpString, 'drone:GimbalPitchDegree');
    if (gimbalPitch !== null) result.gimbalPitch = gimbalPitch;
    
    const gimbalRoll = extractXMPValue(xmpString, 'drone-dji:GimbalRollDegree')
                    || extractXMPValue(xmpString, 'drone:GimbalRollDegree');
    if (gimbalRoll !== null) result.gimbalRoll = gimbalRoll;
    
    // Flight orientation
    const flightYaw = extractXMPValue(xmpString, 'drone-dji:FlightYawDegree')
                   || extractXMPValue(xmpString, 'drone:FlightYawDegree');
    if (flightYaw !== null) result.flightYaw = flightYaw;
    
    const flightPitch = extractXMPValue(xmpString, 'drone-dji:FlightPitchDegree')
                     || extractXMPValue(xmpString, 'drone:FlightPitchDegree');
    if (flightPitch !== null) result.flightPitch = flightPitch;
    
    const flightRoll = extractXMPValue(xmpString, 'drone-dji:FlightRollDegree')
                    || extractXMPValue(xmpString, 'drone:FlightRollDegree');
    if (flightRoll !== null) result.flightRoll = flightRoll;
    
    // Altitude (DJI provides both absolute and relative)
    const absoluteAlt = extractXMPValue(xmpString, 'drone-dji:AbsoluteAltitude')
                     || extractXMPValue(xmpString, 'drone:AbsoluteAltitude');
    if (absoluteAlt !== null) result.altitude = absoluteAlt;
    
    const relativeAlt = extractXMPValue(xmpString, 'drone-dji:RelativeAltitude')
                     || extractXMPValue(xmpString, 'drone:RelativeAltitude');
    if (relativeAlt !== null) result.relativeAltitude = relativeAlt;
    
    // GPS from XMP (sometimes more accurate than EXIF GPS)
    const gpsLat = extractXMPValue(xmpString, 'drone-dji:GpsLatitude')
                || extractXMPValue(xmpString, 'drone:GpsLatitude');
    if (gpsLat !== null) result.latitude = gpsLat;
    
    const gpsLon = extractXMPValue(xmpString, 'drone-dji:GpsLongitude')
                || extractXMPValue(xmpString, 'drone:GpsLongitude')
                || extractXMPValue(xmpString, 'drone-dji:GpsLongtitude'); // DJI typo in some versions
    if (gpsLon !== null) result.longitude = gpsLon;
    
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function extractXMPValue(xmpString: string, tag: string): number | null {
  // Try attribute format: tag="value"
  const attrRegex = new RegExp(`${tag}="([^"]+)"`, 'i');
  const attrMatch = xmpString.match(attrRegex);
  if (attrMatch) {
    const value = parseFloat(attrMatch[1]);
    return isNaN(value) ? null : value;
  }
  
  // Try element format: <tag>value</tag>
  const elemRegex = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i');
  const elemMatch = xmpString.match(elemRegex);
  if (elemMatch) {
    const value = parseFloat(elemMatch[1]);
    return isNaN(value) ? null : value;
  }
  
  return null;
}

function parseExif(dataView: DataView): ExifData | null {
  const length = dataView.byteLength;
  let offset = 2;
  
  while (offset < length) {
    if (dataView.getUint16(offset) === 0xFFE1) {
      const exifLength = dataView.getUint16(offset + 2);
      return parseExifSegment(dataView, offset + 4, exifLength);
    }
    offset += 2 + dataView.getUint16(offset + 2);
  }
  
  return null;
}

function parseExifSegment(dataView: DataView, start: number, length: number): ExifData | null {
  // Check for "Exif" header
  const exifHeader = String.fromCharCode(
    dataView.getUint8(start),
    dataView.getUint8(start + 1),
    dataView.getUint8(start + 2),
    dataView.getUint8(start + 3)
  );
  
  if (exifHeader !== 'Exif') {
    return null;
  }
  
  const tiffStart = start + 6;
  const littleEndian = dataView.getUint16(tiffStart) === 0x4949;
  
  const ifdOffset = dataView.getUint32(tiffStart + 4, littleEndian);
  
  const exifData: ExifData = {};
  
  // Parse IFD0
  parseIFD(dataView, tiffStart, tiffStart + ifdOffset, littleEndian, exifData);
  
  return exifData;
}

function parseIFD(
  dataView: DataView,
  tiffStart: number,
  ifdStart: number,
  littleEndian: boolean,
  exifData: ExifData
): void {
  try {
    const entries = dataView.getUint16(ifdStart, littleEndian);
    
    for (let i = 0; i < entries; i++) {
      const entryOffset = ifdStart + 2 + i * 12;
      const tag = dataView.getUint16(entryOffset, littleEndian);
      
      switch (tag) {
        case 0x010F: // Make
          exifData.make = readString(dataView, tiffStart, entryOffset, littleEndian);
          break;
        case 0x0110: // Model
          exifData.model = readString(dataView, tiffStart, entryOffset, littleEndian);
          break;
        case 0x8769: // ExifIFDPointer
          const exifOffset = dataView.getUint32(entryOffset + 8, littleEndian);
          parseIFD(dataView, tiffStart, tiffStart + exifOffset, littleEndian, exifData);
          break;
        case 0x8825: // GPSInfoIFDPointer
          const gpsOffset = dataView.getUint32(entryOffset + 8, littleEndian);
          parseGPSIFD(dataView, tiffStart, tiffStart + gpsOffset, littleEndian, exifData);
          break;
        case 0xA002: // ImageWidth
          exifData.imageWidth = dataView.getUint32(entryOffset + 8, littleEndian);
          break;
        case 0xA003: // ImageHeight
          exifData.imageHeight = dataView.getUint32(entryOffset + 8, littleEndian);
          break;
        case 0x920A: // FocalLength
          const focalOffset = dataView.getUint32(entryOffset + 8, littleEndian);
          exifData.focalLength = readRational(dataView, tiffStart + focalOffset, littleEndian);
          break;
      }
    }
  } catch {
    // Ignore parsing errors
  }
}

function parseGPSIFD(
  dataView: DataView,
  tiffStart: number,
  ifdStart: number,
  littleEndian: boolean,
  exifData: ExifData
): void {
  try {
    const entries = dataView.getUint16(ifdStart, littleEndian);
    
    let latRef = 'N';
    let lonRef = 'E';
    let lat: number[] | null = null;
    let lon: number[] | null = null;
    
    for (let i = 0; i < entries; i++) {
      const entryOffset = ifdStart + 2 + i * 12;
      const tag = dataView.getUint16(entryOffset, littleEndian);
      
      switch (tag) {
        case 0x0001: // GPSLatitudeRef
          latRef = String.fromCharCode(dataView.getUint8(entryOffset + 8));
          break;
        case 0x0002: // GPSLatitude
          const latOffset = dataView.getUint32(entryOffset + 8, littleEndian);
          lat = readRationalArray(dataView, tiffStart + latOffset, 3, littleEndian);
          break;
        case 0x0003: // GPSLongitudeRef
          lonRef = String.fromCharCode(dataView.getUint8(entryOffset + 8));
          break;
        case 0x0004: // GPSLongitude
          const lonOffset = dataView.getUint32(entryOffset + 8, littleEndian);
          lon = readRationalArray(dataView, tiffStart + lonOffset, 3, littleEndian);
          break;
        case 0x0006: // GPSAltitude
          const altOffset = dataView.getUint32(entryOffset + 8, littleEndian);
          exifData.altitude = readRational(dataView, tiffStart + altOffset, littleEndian);
          break;
      }
    }
    
    if (lat && lon) {
      exifData.latitude = dmsToDecimal(lat, latRef);
      exifData.longitude = dmsToDecimal(lon, lonRef);
    }
  } catch {
    // Ignore parsing errors
  }
}

function readString(
  dataView: DataView,
  tiffStart: number,
  entryOffset: number,
  littleEndian: boolean
): string {
  const count = dataView.getUint32(entryOffset + 4, littleEndian);
  let stringOffset: number;
  
  if (count <= 4) {
    stringOffset = entryOffset + 8;
  } else {
    stringOffset = tiffStart + dataView.getUint32(entryOffset + 8, littleEndian);
  }
  
  let str = '';
  for (let i = 0; i < count - 1; i++) {
    str += String.fromCharCode(dataView.getUint8(stringOffset + i));
  }
  return str;
}

function readRational(dataView: DataView, offset: number, littleEndian: boolean): number {
  const numerator = dataView.getUint32(offset, littleEndian);
  const denominator = dataView.getUint32(offset + 4, littleEndian);
  return numerator / denominator;
}

function readRationalArray(
  dataView: DataView,
  offset: number,
  count: number,
  littleEndian: boolean
): number[] {
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(readRational(dataView, offset + i * 8, littleEndian));
  }
  return result;
}

export function isImageFile(file: File): boolean {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/dng'];
  return imageTypes.includes(file.type.toLowerCase()) || 
         /\.(jpg|jpeg|png|tiff|tif|dng)$/i.test(file.name);
}

export async function processFiles(files: FileList | File[]): Promise<ImageFile[]> {
  const imageFiles: ImageFile[] = [];
  const fileArray = Array.from(files);
  
  for (const file of fileArray) {
    if (isImageFile(file)) {
      const exif = await extractExifData(file);
      
      imageFiles.push({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        path: file.webkitRelativePath || file.name,
        type: 'file',
        size: file.size,
        lastModified: new Date(file.lastModified),
        exif: exif || undefined,
      });
    }
  }
  
  return imageFiles;
}

export function generateThumbnail(file: File, maxSize: number = 150): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}


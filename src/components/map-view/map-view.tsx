'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Map as MapIcon,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Navigation,
  Box,
  Mountain,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ImageFile } from '@/lib/types/nodeodm';

// Mapbox access token and style from user
const MAPBOX_TOKEN = 'pk.eyJ1IjoidmljdG9yeWZvcnBoaWwiLCJhIjoiY201amFjYTBnMTU4dDJsb2cyMjR1bm16dCJ9.9Zrl9WtrLBK6tXgDJNtUFg';
const MAPBOX_STYLE = 'mapbox://styles/victoryforphil/cm5xshpj600eg01slhyzb1atu';

mapboxgl.accessToken = MAPBOX_TOKEN;

interface MapViewProps {
  images: ImageFile[];
  onImageSelect?: (image: ImageFile) => void;
  selectedImageId?: string;
  className?: string;
}

export function MapView({
  images,
  onImageSelect,
  selectedImageId,
  className,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [is3D, setIs3D] = useState(true);

  // Filter images with GPS data
  const geoImages = images.filter(
    (img) => img.exif?.latitude !== undefined && img.exif?.longitude !== undefined
  );

  // Calculate bounds
  const getBounds = useCallback(() => {
    if (geoImages.length === 0) return null;

    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;

    geoImages.forEach((img) => {
      const lat = img.exif!.latitude!;
      const lng = img.exif!.longitude!;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    });

    const latPad = (maxLat - minLat) * 0.1 || 0.001;
    const lngPad = (maxLng - minLng) * 0.1 || 0.001;

    return new mapboxgl.LngLatBounds(
      [minLng - lngPad, minLat - latPad],
      [maxLng + lngPad, maxLat + latPad]
    );
  }, [geoImages]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const bounds = getBounds();
    const center: [number, number] = bounds
      ? [
          (bounds.getWest() + bounds.getEast()) / 2,
          (bounds.getSouth() + bounds.getNorth()) / 2,
        ]
      : [-98.5795, 39.8283];

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center,
      zoom: bounds ? 14 : 4,
      pitch: 60, // Enable 3D pitch
      bearing: -20,
      attributionControl: false,
      antialias: true,
    });

    map.current.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    // Add navigation control
    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'bottom-right'
    );

    map.current.on('style.load', () => {
      if (!map.current) return;

      // Add terrain source for 3D
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });

      // Enable 3D terrain
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

      // Add sky layer for atmosphere
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15,
        },
      });

      setMapLoaded(true);

      if (bounds && map.current) {
        map.current.fitBounds(bounds, { padding: 50, pitch: 60, bearing: -20 });
      }
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers when images change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove old markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    // Add new markers
    geoImages.forEach((img) => {
      const el = document.createElement('div');
      el.className = 'map-marker';
      el.style.cssText = `
        width: 12px;
        height: 12px;
        background: ${selectedImageId === img.id ? '#00ccff' : '#00ff88'};
        border: 2px solid #000;
        cursor: pointer;
        box-shadow: 0 0 10px ${selectedImageId === img.id ? '#00ccff' : '#00ff88'};
        transition: box-shadow 0.15s ease-out;
      `;

      el.addEventListener('mouseenter', () => {
        el.style.boxShadow = `0 0 20px ${selectedImageId === img.id ? '#00ccff' : '#00ff88'}`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = `0 0 10px ${selectedImageId === img.id ? '#00ccff' : '#00ff88'}`;
      });

      el.addEventListener('click', () => {
        onImageSelect?.(img);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([img.exif!.longitude!, img.exif!.latitude!])
        .setPopup(
          new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div style="padding: 12px; min-width: 180px; font-family: monospace;">
              <strong style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">${img.name}</strong>
              <div style="font-size: 10px; color: #737373; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>LAT</span>
                  <span style="color: #fff;">${img.exif!.latitude!.toFixed(6)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>LNG</span>
                  <span style="color: #fff;">${img.exif!.longitude!.toFixed(6)}</span>
                </div>
                ${img.exif?.altitude ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>ALT</span>
                  <span style="color: #00ff88;">${img.exif.altitude.toFixed(1)}m</span>
                </div>
                ` : ''}
                ${img.exif?.heading !== undefined ? `
                <div style="display: flex; justify-content: space-between;">
                  <span>HDG</span>
                  <span style="color: #00ccff;">${img.exif.heading.toFixed(1)}°</span>
                </div>
                ` : ''}
              </div>
            </div>
          `)
        )
        .addTo(map.current!);

      markersRef.current.set(img.id, marker);
    });
  }, [geoImages, mapLoaded, selectedImageId, onImageSelect]);

  // Fit to bounds when images change
  useEffect(() => {
    if (!map.current || !mapLoaded || geoImages.length === 0) return;

    const bounds = getBounds();
    if (bounds) {
      map.current.fitBounds(bounds, { padding: 50, duration: 1000, pitch: 60, bearing: -20 });
    }
  }, [geoImages.length, mapLoaded, getBounds]);

  // Map controls
  const handleZoomIn = () => map.current?.zoomIn();
  const handleZoomOut = () => map.current?.zoomOut();
  const handleFitBounds = () => {
    const bounds = getBounds();
    if (bounds && map.current) {
      map.current.fitBounds(bounds, { padding: 50, duration: 1000, pitch: 60, bearing: -20 });
    }
  };

  const handleToggle3D = () => {
    if (!map.current) return;
    const newIs3D = !is3D;
    setIs3D(newIs3D);
    
    if (newIs3D) {
      map.current.easeTo({ pitch: 60, bearing: -20, duration: 1000 });
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    } else {
      map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      map.current.setTerrain(null);
    }
  };

  return (
    <div className={cn('h-full w-full flex flex-col', className)}>
      {/* Map Container */}
      <div className="flex-1 relative">
        {geoImages.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-black/80 z-10">
            <Navigation className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-xs uppercase tracking-wider">No GPS Data</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1 uppercase tracking-wider">
              Select images with coordinates
            </p>
          </div>
        )}
        
        <div ref={mapContainer} className="absolute inset-0" />

        {/* Controls */}
        <div className="absolute top-4 left-4 flex flex-col gap-1 z-10">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 bg-black/80 border-border hover:bg-black"
                  onClick={handleToggle3D}
                >
                  <Mountain className={cn('h-4 w-4', is3D && 'text-[#00ff88]')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Toggle 3D terrain</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 bg-black/80 border-border hover:bg-black"
                  onClick={handleFitBounds}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Fit to bounds</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 bg-black/80 border-border hover:bg-black"
                  onClick={handleZoomIn}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Zoom in</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 bg-black/80 border-border hover:bg-black"
                  onClick={handleZoomOut}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Zoom out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Stats overlay */}
        {geoImages.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-black/80 border border-border px-3 py-2 z-10">
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#00ff88]" />
                <span>{geoImages.length} points</span>
              </div>
              {is3D && (
                <div className="flex items-center gap-1.5 text-[#00ccff]">
                  <Mountain className="h-3 w-3" />
                  <span>3D</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

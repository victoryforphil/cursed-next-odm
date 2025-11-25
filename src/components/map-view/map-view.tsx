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
  Image as ImageIcon,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    name: string;
    altitude?: number;
    heading?: number;
    gimbalPitch?: number;
  };
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
  const [mapStyle, setMapStyle] = useState<'satellite' | 'streets'>('satellite');

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

    // Add padding
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
      : [-98.5795, 39.8283]; // Center of US as default

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center,
      zoom: bounds ? 14 : 4,
      attributionControl: false,
    });

    map.current.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    map.current.on('load', () => {
      setMapLoaded(true);

      if (bounds && map.current) {
        map.current.fitBounds(bounds, { padding: 50 });
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
        width: 24px;
        height: 24px;
        background: ${selectedImageId === img.id ? '#3b82f6' : '#10b981'};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      `;

      // Add heading indicator if available
      if (img.exif?.heading !== undefined) {
        const arrow = document.createElement('div');
        arrow.style.cssText = `
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 8px solid white;
          transform: rotate(${img.exif.heading}deg);
          transform-origin: center;
        `;
        el.appendChild(arrow);
      }

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.2)';
        el.style.zIndex = '100';
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
        el.style.zIndex = '1';
      });

      el.addEventListener('click', () => {
        onImageSelect?.(img);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([img.exif!.longitude!, img.exif!.latitude!])
        .setPopup(
          new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div style="padding: 8px; min-width: 150px;">
              <strong style="font-size: 13px;">${img.name}</strong>
              <div style="font-size: 11px; color: #666; margin-top: 4px;">
                <div>Lat: ${img.exif!.latitude!.toFixed(6)}</div>
                <div>Lng: ${img.exif!.longitude!.toFixed(6)}</div>
                ${img.exif?.altitude ? `<div>Alt: ${img.exif.altitude.toFixed(1)}m</div>` : ''}
                ${img.exif?.heading !== undefined ? `<div>Heading: ${img.exif.heading.toFixed(1)}°</div>` : ''}
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
      map.current.fitBounds(bounds, { padding: 50, duration: 1000 });
    }
  }, [geoImages.length, mapLoaded, getBounds]);

  // Handle selected image
  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedImageId) return;

    const marker = markersRef.current.get(selectedImageId);
    if (marker) {
      const lngLat = marker.getLngLat();
      map.current.flyTo({ center: lngLat, zoom: 17, duration: 1000 });
      marker.togglePopup();
    }
  }, [selectedImageId, mapLoaded]);

  // Map controls
  const handleZoomIn = () => map.current?.zoomIn();
  const handleZoomOut = () => map.current?.zoomOut();
  const handleFitBounds = () => {
    const bounds = getBounds();
    if (bounds && map.current) {
      map.current.fitBounds(bounds, { padding: 50, duration: 1000 });
    }
  };

  const handleToggleStyle = () => {
    if (!map.current) return;
    const newStyle = mapStyle === 'satellite' ? 'streets' : 'satellite';
    setMapStyle(newStyle);
    map.current.setStyle(
      newStyle === 'satellite'
        ? MAPBOX_STYLE
        : 'mapbox://styles/mapbox/streets-v12'
    );
  };

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <MapIcon className="h-5 w-5" />
            Image Locations
            {geoImages.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {geoImages.length} / {images.length}
              </Badge>
            )}
          </CardTitle>
          <TooltipProvider>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleToggleStyle}
                  >
                    <Layers className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle map style</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleFitBounds}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fit to bounds</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleZoomIn}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleZoomOut}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 relative">
        {geoImages.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted/50">
            <Navigation className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">No GPS data available</p>
            <p className="text-xs mt-1">
              Select images with GPS coordinates to view on map
            </p>
          </div>
        ) : null}
        <div
          ref={mapContainer}
          className={cn(
            'absolute inset-0',
            geoImages.length === 0 && 'opacity-30'
          )}
        />

        {/* Legend */}
        {geoImages.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 text-xs border shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white" />
              <span>Image location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 border border-white" />
              <span>Selected</span>
            </div>
            {geoImages.some((img) => img.exif?.heading !== undefined) && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <Navigation className="h-3 w-3" />
                <span>Arrow shows heading</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


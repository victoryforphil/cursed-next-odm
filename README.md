# CursedODM

A modern, feature-rich frontend for [NodeODM](https://github.com/OpenDroneMap/NodeODM) / [OpenDroneMap](https://www.opendronemap.org/).

![CursedODM Screenshot](docs/screenshot.png)

## Features

### 📁 Advanced File Browser
- **Tree view** with expandable folders
- **Multi-select** files and directories
- **Drag & drop** support
- **Directory scanning** - select a folder and automatically find all images
- File size and count indicators

### 🗺️ Map View
- View image locations on an interactive **Mapbox** map
- Automatic GPS extraction from EXIF metadata
- **DJI drone support** (Matrice 4E, Mavic, Phantom, etc.)
  - Gimbal orientation (yaw, pitch, roll)
  - Flight orientation
  - Absolute and relative altitude
- Heading indicators for each image
- Click to select images on the map

### 📊 Task Management
- Create, monitor, and manage ODM processing tasks
- **Processing presets** (Fast, Default, High Quality, DTM/DSM)
- Advanced options configuration
- Real-time progress tracking
- Task status indicators (Queued, Running, Completed, Failed, Canceled)

### 📜 Log Viewer
- Real-time console output streaming
- **Search** through logs
- Auto-scroll with pause/resume
- Copy logs to clipboard
- Syntax highlighting for errors/warnings

### 📦 Point Cloud Viewer
- View Entwine Point Tile (EPT) point clouds
- Multiple color modes (RGB, Elevation, Intensity)
- Interactive 3D navigation
- Download point cloud data

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for NodeODM)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/cursed-next-odm.git
cd cursed-next-odm
```

2. Install dependencies:
```bash
npm install
```

3. Start NodeODM (using Docker):
```bash
docker run -d -p 3001:3000 --name nodeodm opendronemap/nodeodm
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Configuration

The app connects to NodeODM at `http://localhost:3001` by default. You can change this in the Settings dialog (gear icon in the header).

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Maps**: [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Notifications**: [Sonner](https://sonner.emilkowal.ski/)

## Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Main dashboard
│   └── globals.css        # Global styles
├── components/
│   ├── file-browser/      # File selection components
│   ├── layout/            # Header, settings dialog
│   ├── log-viewer/        # Console output viewer
│   ├── map-view/          # Mapbox map component
│   ├── pointcloud-viewer/ # Point cloud viewer
│   ├── tasks/             # Task list and creation
│   └── ui/                # shadcn/ui components
├── hooks/
│   └── use-nodeodm.ts     # NodeODM API hook
└── lib/
    ├── api/               # NodeODM API client
    ├── store/             # Zustand store
    ├── types/             # TypeScript types
    └── utils/             # Utilities (EXIF parsing, etc.)
```

## DJI Drone Support

CursedODM includes enhanced support for DJI drones, extracting XMP metadata including:

- **GimbalYawDegree** / **GimbalPitchDegree** / **GimbalRollDegree**
- **FlightYawDegree** / **FlightPitchDegree** / **FlightRollDegree**
- **AbsoluteAltitude** / **RelativeAltitude**
- **GPS Coordinates** (from XMP for higher precision)

Tested with:
- DJI Matrice 4E
- DJI Mavic series
- DJI Phantom series

## API Reference

See [odm_api_docs.md](odm_api_docs.md) for the complete NodeODM API documentation.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [OpenDroneMap](https://www.opendronemap.org/) - The amazing open-source photogrammetry toolkit
- [NodeODM](https://github.com/OpenDroneMap/NodeODM) - The API server this frontend connects to
- [WebODM](https://github.com/OpenDroneMap/WebODM) - The original web interface that inspired this project

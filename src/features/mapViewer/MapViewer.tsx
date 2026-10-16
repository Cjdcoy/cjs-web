import { lazy, Suspense } from "react";
import { SkeletonGroup } from "../../components/ui";
import type { MapViewerProps } from "./MapViewerCanvas";

// three.js is only reachable through this dynamic import, so it never enters the initial or route chunks.
const MapViewerCanvas = lazy(() => import("./MapViewerCanvas"));

export function MapViewer(props: MapViewerProps) {
  return (
    <Suspense fallback={<SkeletonGroup count={3} label="Loading the 3D viewer" variant="card" />}>
      <MapViewerCanvas key={props.modelUrl} {...props} />
    </Suspense>
  );
}

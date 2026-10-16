import { ArrowLeft, Box, Map as MapIcon } from "lucide-react";
import { EmptyState, ErrorState, Link, SkeletonGroup } from "../../components/ui";
import { getMapModelUrl, hasMapModels } from "../../lib/mapModels";
import { mapDetailPath, useBrowserLocation, useSourceContext } from "../../lib/routing";
import { MapViewer, parseCameraHash } from "../mapViewer";
import { selectCheckpoint } from "./mapDetailModel";
import { useMapRecord } from "./useMapDetail";
import "./maps.css";

export function MapViewerPage({ mapId }: { mapId: string }) {
  const { source } = useSourceContext();

  return (
    <div className="cjs-map-detail cjs-stack">
      <Link
        className="cjs-map-detail__back"
        href={mapDetailPath(mapId, { source })}
        variant="standalone"
      >
        <ArrowLeft aria-hidden="true" size={17} />
        Back to map
      </Link>
      {hasMapModels() ? (
        <MapViewerContent mapId={mapId} />
      ) : (
        <EmptyState
          icon={Box}
          title="3D map views are not available"
          description="This site is not configured with 3D map models."
        />
      )}
    </div>
  );
}

function MapViewerContent({ mapId }: { mapId: string }) {
  const location = useBrowserLocation();
  const { source } = useSourceContext();
  const mapRequest = useMapRecord({ mapId, lookup: "mapid", source });
  const map = mapRequest.data ? selectCheckpoint(mapRequest.data, 0) : null;
  const modelUrl = map ? getMapModelUrl(map.mapname) : null;

  if (mapRequest.status === "error") {
    return (
      <ErrorState
        title="Map details could not be loaded"
        description={mapRequest.error ?? "The map request failed."}
        onRetry={mapRequest.reload}
        retryLabel="Retry map request"
      />
    );
  }
  if (mapRequest.status === "success" && (!map || !modelUrl)) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Map unavailable"
        description="This map is not available in the selected data source, or its link is invalid."
      />
    );
  }
  if (!map || !modelUrl) {
    return <SkeletonGroup count={4} label="Loading map details" variant="card" />;
  }

  return (
    <>
      <header className="cjs-page-heading">
        <div className="cjs-page-heading__eyebrow">
          <Box size={18} aria-hidden="true" />
          <span>3D map view</span>
        </div>
        <h1>{map.mapname}</h1>
      </header>
      <MapViewer
        initialPose={parseCameraHash(location.hash)}
        mapName={map.mapname}
        modelUrl={modelUrl}
      />
    </>
  );
}

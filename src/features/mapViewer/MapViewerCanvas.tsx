import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Texture,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Layers as LayersIcon, X } from "lucide-react";
import { Button, EmptyState, ErrorState, IconButton } from "../../components/ui";
import {
  codToScenePosition,
  codToSceneRotation,
  METRES_PER_COD_UNIT,
  sceneToCodPose,
  VIEW_FIELD_OF_VIEW,
  type CodPose,
  type ViewerFrame,
} from "./codSpace";
import { cameraReadout, flySpeedAfterWheel, hipReticle } from "./viewerHud";
import { loadLegacySky } from "./legacySky";
import {
  createSurfaceMaterials,
  loadSurfaceLighting,
  type SurfaceMaterials,
} from "./legacySurface";
import { instanceMeshes } from "./instancing";
import { viewmodelMotion } from "./viewmodelMotion";
import "./displayGamma";
import "./mapViewer.css";

/** Display gamma (CoD2's r_gamma) of the map render when no brightness is given. */
const DEFAULT_MAP_BRIGHTNESS = 1.3;

export interface MapViewerProps {
  modelUrl: string;
  mapName: string;
  /** Starting free-camera viewpoint; the whole map is framed when omitted. */
  initialPose?: CodPose | null;
  /** Read once per animation frame. A following frame drives the camera; otherwise it is drawn as a marker. */
  getFrame?: () => ViewerFrame | null;
  /** Flat CoD xyz endpoint pairs of path segments, drawn while the camera is detached. */
  path?: readonly number[];
  /**
   * Controls rendered directly below the view. A function receives the viewer's own tools (the
   * Layers button) to place in its control bar; otherwise the tools follow in their own bar.
   */
  children?: ReactNode | ((tools: ReactNode) => ReactNode);
  /** Visual layer drawn over the canvas (for example a HUD). */
  overlay?: ReactNode;
  /** First-person weapon model, loaded on first show and drawn only while following. */
  viewmodel?: ViewmodelOptions;
  /** Receives a ground probe once the map's collision has loaded, and null on unmount. */
  onCollision?: (probe: CollisionProbe | null) => void;
  /** Display gamma of the map render (see displayGamma.ts); above 1 lifts shadows. */
  brightness?: number;
  /** Draws CoD2's hip reticle at the view centre; on unless false. */
  crosshair?: boolean;
}

/** Ground queries against the map's player-solid collision (solid, playerclip, slick, ladder). */
export interface CollisionProbe {
  /** surfaceFlags of the collision just below a CoD feet origin, or null when nothing is there. */
  surfaceFlagsBelow(x: number, y: number, z: number): number | null;
  /** Every surfaceFlags value present, to preload the matching sounds. */
  surfaceFlags: readonly number[];
}

export interface ViewmodelOptions {
  url: string;
  visible: boolean;
  /** Called once when the model cannot be loaded. */
  onUnavailable: () => void;
}

type LoadState =
  | { status: "loading"; phase: "download" | "prepare"; loaded: number; total: number }
  | { status: "ready" }
  | { status: "missing" }
  | { status: "error"; message: string; retryable: boolean };

interface LayerItem {
  id: number;
  name: string;
  child: boolean;
  visible: boolean;
  color?: string;
}

const FLY_SPEED = 400; // CoD units per second
const LOOK_SPEED = Math.PI / 2; // radians per second for arrow-key look
const MARKER_RADIUS = 16; // CoD units, half a player's width
const FLY_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "KeyQ",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);
// Collision classes use a fixed diagnostic legend shared with the map converter, not brand colours.
const COLLISION_COLORS: Readonly<Record<string, number>> = {
  solid: 0x9a9a9a,
  playerclip: 0xff3333,
  slick: 0x33e0ff,
  ladder: 0x33ff66,
  nodrop: 0xb044ff,
  sky: 0x8fb8ff,
  model: 0xff8c1a,
};
const OTHER_COLLISION_COLOR = 0xffd633;
const COLLISION_OPACITY = 0.35;

/**
 * Camera-space placement of the first-person weapon model, in metres and radians (three.js camera
 * space: -Z forward, +Y up). The calibration knob for the converted viewmodel; the default turns
 * CoD's +X-forward model space to face the camera direction.
 */
const VIEWMODEL_PLACEMENT = {
  position: [0, 0, 0] as const,
  rotation: [0, Math.PI / 2, 0] as const,
  scale: 1,
  fieldOfView: VIEW_FIELD_OF_VIEW,
};

class ModelNotFoundError extends Error {}

export default function MapViewerCanvas({
  brightness = DEFAULT_MAP_BRIGHTNESS,
  children,
  crosshair = true,
  getFrame,
  initialPose,
  mapName,
  modelUrl,
  onCollision,
  overlay,
  path,
  viewmodel,
}: MapViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const getFrameRef = useRef(getFrame);
  const viewmodelRef = useRef(viewmodel);
  const brightnessRef = useRef(brightness);
  const onCollisionRef = useRef(onCollision);
  const startRef = useRef({ initialPose, path });
  const objectsRef = useRef(new Map<number, Object3D>());
  // Forces a redraw for scene changes the render loop cannot see (layers, load, resize).
  const needsRenderRef = useRef(true);
  const [load, setLoad] = useState<LoadState>({
    status: "loading",
    phase: "download",
    loaded: 0,
    total: 0,
  });
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const layersButtonRef = useRef<HTMLButtonElement>(null);
  const layersPanelRef = useRef<HTMLElement>(null);
  const layersId = useId();
  const [free, setFree] = useState(true);
  const [locked, setLocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const helpId = useId();

  useEffect(() => {
    getFrameRef.current = getFrame;
    viewmodelRef.current = viewmodel;
    onCollisionRef.current = onCollision;
  }, [getFrame, onCollision, viewmodel]);

  useEffect(() => {
    brightnessRef.current = brightness;
    needsRenderRef.current = true;
  }, [brightness]);

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return undefined;

    let renderer: WebGLRenderer;
    try {
      // Default power preference keeps dual-GPU laptops on the integrated GPU; dense screens skip MSAA.
      renderer = new WebGLRenderer({ antialias: window.devicePixelRatio < 2 });
    } catch {
      setLoad({
        status: "error",
        message: "This browser or device could not start WebGL, which the 3D view needs.",
        retryable: false,
      });
      return undefined;
    }

    const controller = new AbortController();
    const objects = objectsRef.current;
    const styles = getComputedStyle(host);
    const accent = new Color(styles.getPropertyValue("--cjs-color-accent").trim() || "white");
    const canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    canvas.className = "cjs-map-viewer__canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.append(canvas);

    const scene = new Scene();
    // The display gamma (displayGamma.ts), set before each frame; the weapon pass keeps it.
    scene.onBeforeRender = () => {
      renderer.toneMappingExposure = brightnessRef.current;
    };
    scene.background = new Color(styles.getPropertyValue("--cjs-color-elevated").trim() || "black");
    scene.add(new HemisphereLight(0xffffff, 0x404850, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.4, 1, 0.25);
    scene.add(sun);
    // The map is static: world matrices are computed once after load and for the moving marker.
    scene.matrixWorldAutoUpdate = false;
    scene.updateMatrixWorld(true);

    const camera = new PerspectiveCamera(VIEW_FIELD_OF_VIEW, 1, 0.05, 2000);
    const controls = new PointerLockControls(camera, canvas);
    const materials = createMaterialCache();
    const surfaces: SurfaceMaterials[] = [];

    const runner = new Group();
    runner.visible = false;
    const marker = new Mesh(
      new SphereGeometry(MARKER_RADIUS * METRES_PER_COD_UNIT, 16, 12),
      // Drawn through walls so the runner stays findable from a detached camera.
      new MeshBasicMaterial({ color: accent, depthTest: false, transparent: true, opacity: 0.85 }),
    );
    marker.renderOrder = 1;
    runner.add(marker);
    const { initialPose: startPose, path: startPath } = startRef.current;
    if (startPath && startPath.length >= 6) runner.add(createPath(startPath, accent));
    scene.add(runner);
    runner.updateMatrixWorld(true);

    // The weapon is a second pass over a cleared depth buffer, so it never clips into walls.
    const weaponScene = new Scene();
    weaponScene.add(new HemisphereLight(0xffffff, 0x404850, 2));
    const weaponCamera = new PerspectiveCamera(VIEWMODEL_PLACEMENT.fieldOfView, 1, 0.01, 10);
    const weapon = new Group();
    weapon.position.set(...VIEWMODEL_PLACEMENT.position);
    weapon.rotation.set(...VIEWMODEL_PLACEMENT.rotation);
    weapon.scale.setScalar(VIEWMODEL_PLACEMENT.scale);
    // The frame's swing and lean, in the model's own frame (viewmodelMotion.ts).
    const weaponMotion = new Group();
    weapon.add(weaponMotion);
    weaponScene.add(weapon);
    let weaponState: "idle" | "loading" | "ready" | "failed" = "idle";
    renderer.autoClear = false;

    const loadWeapon = async (url: string) => {
      weaponState = "loading";
      try {
        const data = await fetchModel(url, controller.signal, () => undefined);
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.parseAsync(data, "");
        const weaponSurfaces = createSurfaceMaterials(await loadSurfaceLighting(gltf));
        if (controller.signal.aborted) {
          disposeObject(gltf.scene);
          weaponSurfaces.dispose();
          return;
        }
        surfaces.push(weaponSurfaces);
        gltf.scene.traverse((object) => {
          const mesh = object as Partial<Mesh>;
          if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
          mesh.material = weaponSurfaces.material(object as Mesh);
        });
        weaponMotion.add(gltf.scene);
        weaponScene.updateMatrixWorld(true);
        weaponState = "ready";
      } catch {
        if (controller.signal.aborted) return;
        weaponState = "failed";
        viewmodelRef.current?.onUnavailable();
      }
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      weaponCamera.aspect = width / height;
      weaponCamera.updateProjectionMatrix();
      // The reticle is DOM sized from the view height, like the game's 640×480 virtual screen.
      for (const [name, value] of Object.entries(hipReticle(height))) {
        host.style.setProperty(`--cjs-reticle-${name}`, `${value}px`);
      }
      needsRenderRef.current = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const keys = new Set<string>();
    let isFree = true;
    let reportedFree = true;
    let speed = FLY_SPEED;
    let currentSpeed = 0;
    // Set by a click into the free view: the wheel then sets the fly speed instead of scrolling.
    let capturing = false;
    const stopCapture = () => (capturing = false);
    const isFlying = () =>
      isFree && (controls.isLocked || document.activeElement === hostRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") capturing = false;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!FLY_KEYS.has(event.code) || !isFlying()) return;
      keys.add(event.code);
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const onWindowBlur = () => {
      keys.clear();
      capturing = false;
    };
    // Under pointer lock Chrome and WebKit dispatch wheel events to the locked canvas, which bubble
    // here. Pinch zoom (ctrl+wheel) keeps the browser default.
    const onWheel = (event: WheelEvent) => {
      if (!capturing || !isFree || event.ctrlKey) return;
      event.preventDefault();
      speed = flySpeedAfterWheel(speed, event.deltaY, event.deltaMode);
    };
    const onCanvasPointerDown = () => (capturing = isFree);
    const onCanvasClick = () => {
      if (!isFree || controls.isLocked) return;
      // Pointer lock can be refused (no user activation, embedded frames); keyboard flying still works.
      void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
    };
    // A restored context starts blank.
    const onContextRestored = () => (needsRenderRef.current = true);
    const onLock = () => setLocked(true);
    const onUnlock = () => {
      keys.clear();
      capturing = false;
      setLocked(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("focusout", stopCapture);
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    controls.addEventListener("lock", onLock);
    controls.addEventListener("unlock", onUnlock);

    const up = new Vector3(0, 1, 0);
    const forward = new Vector3();
    const right = new Vector3();
    const move = new Vector3();
    const look = new Euler(0, 0, 0, "YXZ");
    let last = performance.now();
    // What the last drawn picture depended on; an unchanged view is not redrawn.
    const drawnPosition = new Vector3();
    const drawnQuaternion = new Quaternion();
    const drawnMarker = new Vector3();
    let drawnRunner = false;
    let drawnWeapon = false;
    const drawnWeaponPosition = new Vector3();
    const drawnWeaponQuaternion = new Quaternion();
    needsRenderRef.current = true;
    // What the free-camera readout last showed; it is rewritten at most every 100 ms on a change.
    const shownPosition = new Vector3(Number.NaN, 0, 0);
    const shownQuaternion = new Quaternion();
    let shownSpeeds = "";
    let shownAt = Number.NEGATIVE_INFINITY;
    const updateReadout = (now: number) => {
      const readout = readoutRef.current;
      const speeds = `${currentSpeed} ${speed}`;
      if (
        !readout ||
        now - shownAt < 100 ||
        (shownSpeeds === speeds &&
          shownPosition.equals(camera.position) &&
          shownQuaternion.equals(camera.quaternion))
      ) {
        return;
      }
      shownAt = now;
      shownSpeeds = speeds;
      shownPosition.copy(camera.position);
      shownQuaternion.copy(camera.quaternion);
      look.setFromQuaternion(camera.quaternion);
      const pose = sceneToCodPose(camera.position.toArray(), [look.x, look.y]);
      readout.textContent = cameraReadout(pose, currentSpeed, speed);
    };

    const fly = (seconds: number) => {
      const fast = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4 : 1;
      camera.getWorldDirection(forward);
      right.crossVectors(forward, up).normalize();
      move.set(0, 0, 0);
      if (keys.has("KeyW")) move.add(forward);
      if (keys.has("KeyS")) move.sub(forward);
      if (keys.has("KeyD")) move.add(right);
      if (keys.has("KeyA")) move.sub(right);
      if (keys.has("Space") || keys.has("KeyE")) move.y += 1;
      if (keys.has("KeyC") || keys.has("KeyQ")) move.y -= 1;
      currentSpeed = move.lengthSq() > 0 ? speed * fast : 0;
      if (move.lengthSq() > 0) {
        camera.position.addScaledVector(
          move.normalize(),
          speed * fast * METRES_PER_COD_UNIT * seconds,
        );
      }
      const turn = Number(keys.has("ArrowLeft")) - Number(keys.has("ArrowRight"));
      const tilt = Number(keys.has("ArrowUp")) - Number(keys.has("ArrowDown"));
      if (turn || tilt) {
        look.setFromQuaternion(camera.quaternion);
        look.y += turn * LOOK_SPEED * seconds;
        look.x = Math.min(1.55, Math.max(-1.55, look.x + tilt * LOOK_SPEED * seconds));
        camera.quaternion.setFromEuler(look);
      }
    };

    renderer.setAnimationLoop((now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      const frame = getFrameRef.current?.() ?? null;
      isFree = !frame?.follow;
      if (isFree !== reportedFree) {
        reportedFree = isFree;
        if (!isFree && controls.isLocked) controls.unlock();
        keys.clear();
        setFree(isFree);
      }
      runner.visible = Boolean(frame) && isFree;
      if (frame && !isFree) applyPose(camera, frame.pose);
      if (frame && isFree) {
        marker.position.set(...codToScenePosition(frame.pose.x, frame.pose.y, frame.pose.z));
        marker.updateMatrixWorld(true);
      }
      if (isFree) {
        fly(seconds);
        updateReadout(now);
      }
      const weaponOptions = frame && !isFree ? viewmodelRef.current : undefined;
      if (weaponOptions?.visible && weaponState === "idle") void loadWeapon(weaponOptions.url);
      // The weapon lives in camera space: whether it is drawn and its swing/lean offset are its state.
      const drawWeapon = Boolean(weaponOptions?.visible) && weaponState === "ready";
      viewmodelMotion(frame?.weapon, weaponMotion.position, weaponMotion.quaternion);
      if (
        !needsRenderRef.current &&
        drawnPosition.equals(camera.position) &&
        drawnQuaternion.equals(camera.quaternion) &&
        drawnMarker.equals(marker.position) &&
        drawnRunner === runner.visible &&
        drawnWeapon === drawWeapon &&
        (!drawWeapon ||
          (drawnWeaponPosition.equals(weaponMotion.position) &&
            drawnWeaponQuaternion.equals(weaponMotion.quaternion)))
      ) {
        return;
      }
      needsRenderRef.current = false;
      drawnPosition.copy(camera.position);
      drawnQuaternion.copy(camera.quaternion);
      drawnMarker.copy(marker.position);
      drawnRunner = runner.visible;
      drawnWeapon = drawWeapon;
      drawnWeaponPosition.copy(weaponMotion.position);
      drawnWeaponQuaternion.copy(weaponMotion.quaternion);
      renderer.clear();
      renderer.render(scene, camera);
      if (drawWeapon) {
        renderer.clearDepth();
        renderer.render(weaponScene, weaponCamera);
      }
    });

    let reportedPercent = -1;
    const onProgress = (loaded: number, total: number) => {
      const percent = total > 0 ? Math.floor((loaded / total) * 100) : Math.floor(loaded / 1e6);
      if (percent === reportedPercent) return;
      reportedPercent = percent;
      setLoad({ status: "loading", phase: "download", loaded, total });
    };

    void (async () => {
      try {
        const data = await fetchModel(modelUrl, controller.signal, onProgress);
        setLoad({ status: "loading", phase: "prepare", loaded: data.byteLength, total: 0 });
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.parseAsync(data, "");
        const root = gltf.scene;
        const [lighting, sky] = await Promise.all([loadSurfaceLighting(gltf), loadLegacySky(gltf)]);
        const mapSurfaces = createSurfaceMaterials(lighting);
        if (controller.signal.aborted) {
          disposeObject(root);
          mapSurfaces.dispose();
          sky?.dispose();
          return;
        }
        surfaces.push(mapSurfaces);
        if (sky) scene.background = sky;
        for (const node of root.children) {
          const isCollision = nameOf(node) === "collision";
          // Collision is a debug overlay; start with only the rendered map visible.
          if (isCollision || nameOf(node) === "entities") node.visible = false;
          node.traverse((object) => {
            if (object.userData.hidden) object.visible = false;
            const mesh = object as Partial<Mesh>;
            if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
            if (isCollision) {
              mesh.material = materials.collision(collisionClass(object));
              return;
            }
            mesh.material = mapSurfaces.material(object as Mesh);
          });
        }
        const layerItems = listLayers(root, objects, materials);
        instanceMeshes(root, new Set(objects.values()), (mesh) => mapSurfaces.probeIndex(mesh));
        scene.add(root);
        scene.updateMatrixWorld(true);
        frameCamera(camera, root);
        if (startPose) applyPose(camera, startPose);
        needsRenderRef.current = true;
        setLayers(layerItems);
        onCollisionRef.current?.(createCollisionProbe(root));
        setLoad({ status: "ready" });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ModelNotFoundError) {
          setLoad({ status: "missing" });
          return;
        }
        setLoad({
          status: "error",
          message:
            error instanceof Error && error.message
              ? `The map model could not be loaded: ${error.message}`
              : "The map model could not be loaded.",
          retryable: true,
        });
      }
    })();

    return () => {
      controller.abort();
      renderer.setAnimationLoop(null);
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("focusout", stopCapture);
      canvas.removeEventListener("pointerdown", onCanvasPointerDown);
      canvas.removeEventListener("click", onCanvasClick);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      controls.removeEventListener("lock", onLock);
      controls.removeEventListener("unlock", onUnlock);
      if (controls.isLocked) controls.unlock();
      controls.dispose();
      onCollisionRef.current?.(null);
      disposeObject(scene);
      disposeObject(weaponScene);
      materials.dispose();
      surfaces.forEach((entry) => entry.dispose());
      if (scene.background instanceof Texture) scene.background.dispose();
      objects.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [attempt, modelUrl]);

  useEffect(() => {
    if (layersOpen) layersPanelRef.current?.focus();
  }, [layersOpen]);

  const toggleLayer = (id: number, visible: boolean) => {
    const object = objectsRef.current.get(id);
    if (!object) return;
    object.visible = visible;
    needsRenderRef.current = true;
    setLayers((items) => items.map((item) => (item.id === id ? { ...item, visible } : item)));
  };

  const retry = () => {
    setLayers([]);
    setLoad({ status: "loading", phase: "download", loaded: 0, total: 0 });
    setAttempt((value) => value + 1);
  };

  const closeLayers = () => {
    setLayersOpen(false);
    layersButtonRef.current?.focus();
  };

  const tools =
    layers.length > 0 ? (
      <Button
        ref={layersButtonRef}
        aria-controls={layersId}
        aria-expanded={layersOpen}
        size="small"
        variant="secondary"
        onClick={() => setLayersOpen((open) => !open)}
      >
        <LayersIcon size={16} aria-hidden="true" />
        Layers
      </Button>
    ) : null;

  return (
    <div className="cjs-map-viewer" data-locked={locked || undefined}>
      <div className="cjs-map-viewer__frame">
        <div
          ref={hostRef}
          className="cjs-map-viewer__view"
          role="application"
          aria-label={`3D view of ${mapName}`}
          aria-describedby={free ? helpId : undefined}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the focused view receives fly-camera keys
          tabIndex={free ? 0 : -1}
        >
          <div ref={stageRef} className="cjs-map-viewer__stage" />
          {load.status === "ready" && overlay}
          {load.status === "ready" && crosshair && (
            <span className="cjs-map-viewer__reticle" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
          )}
          <span
            ref={readoutRef}
            className="cjs-map-viewer__readout"
            aria-hidden="true"
            hidden={!free || load.status !== "ready"}
          />
          {load.status !== "ready" && (
            <div className="cjs-map-viewer__overlay">
              <ViewerStatus load={load} mapName={mapName} onRetry={retry} />
            </div>
          )}
        </div>

        {layersOpen && layers.length > 0 && (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc closes this non-modal panel
          <section
            ref={layersPanelRef}
            id={layersId}
            className="cjs-map-viewer__layers"
            role="dialog"
            aria-labelledby={`${layersId}-title`}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              closeLayers();
            }}
          >
            <div className="cjs-map-viewer__layers-header">
              <h2 id={`${layersId}-title`}>Map layers</h2>
              <IconButton
                label="Close map layers"
                size="small"
                variant="ghost"
                onClick={closeLayers}
              >
                <X size={16} aria-hidden="true" />
              </IconButton>
            </div>
            <ul>
              {layers.map((layer) => (
                <li key={layer.id} data-child={layer.child || undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={(event) => toggleLayer(layer.id, event.currentTarget.checked)}
                    />
                    {layer.color && (
                      <span
                        className="cjs-map-viewer__swatch"
                        style={{ background: layer.color }}
                        aria-hidden="true"
                      />
                    )}
                    {layer.name || "Unnamed layer"}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {typeof children === "function" ? (
        children(tools)
      ) : (
        <>
          {children}
          {tools && <div className="cjs-map-viewer__tools">{tools}</div>}
        </>
      )}

      {free && (
        <p className="cjs-map-viewer__help" id={helpId}>
          Focus or click the view, then fly with W A S D, rise with Space or E, sink with Q, and
          look with the arrow keys. Clicking captures the mouse for looking and the scroll wheel for
          the fly speed; Esc releases them. Hold Shift to move faster.
        </p>
      )}
    </div>
  );
}

function ViewerStatus({
  load,
  mapName,
  onRetry,
}: {
  load: Exclude<LoadState, { status: "ready" }>;
  mapName: string;
  onRetry: () => void;
}) {
  if (load.status === "missing") {
    return (
      <EmptyState
        title="No 3D model for this map yet"
        description={`A 3D model of ${mapName} has not been published.`}
      />
    );
  }
  if (load.status === "error") {
    return (
      <ErrorState
        title="3D view unavailable"
        description={load.message}
        onRetry={load.retryable ? onRetry : undefined}
        retryLabel="Retry loading the map model"
      />
    );
  }

  const determinate = load.phase === "download" && load.total > 0 && load.loaded <= load.total;
  return (
    <div className="cjs-map-viewer__progress" role="status">
      <span>{load.phase === "prepare" ? "Preparing map geometry…" : "Downloading map model…"}</span>
      {determinate ? (
        <progress value={load.loaded} max={load.total} aria-label="Map model download" />
      ) : (
        <progress aria-label="Map model loading" />
      )}
      <span className="cjs-map-viewer__progress-detail">
        {determinate
          ? `${formatMegabytes(load.loaded)} of ${formatMegabytes(load.total)}`
          : `${formatMegabytes(load.loaded)}`}
      </span>
    </div>
  );
}

async function fetchModel(
  url: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (response.status === 404) throw new ModelNotFoundError("Not found");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get("Content-Length")) || 0;
  if (!response.body) return response.arrayBuffer();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const data = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data.buffer;
}

function applyPose(camera: PerspectiveCamera, pose: CodPose): void {
  camera.position.set(...codToScenePosition(pose.x, pose.y, pose.z));
  const [x, y, z] = codToSceneRotation(pose.pitch, pose.yaw);
  camera.rotation.set(x, y, z, "YXZ");
}

function frameCamera(camera: PerspectiveCamera, root: Object3D): void {
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  camera.far = Math.max(100, size.length() * 4);
  camera.updateProjectionMatrix();
  camera.position.set(
    center.x + size.x * 0.6,
    center.y + size.y * 0.6 + 1,
    center.z + size.z * 0.6,
  );
  camera.lookAt(center);
}

function createPath(path: readonly number[], color: Color): LineSegments {
  const positions = new Float32Array(path.length);
  for (let index = 0; index + 2 < path.length; index += 3) {
    const [x, y, z] = codToScenePosition(path[index], path[index + 1], path[index + 2]);
    positions[index] = x;
    positions[index + 1] = y;
    positions[index + 2] = z;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(
    geometry,
    new LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }),
  );
}

const PLAYER_SOLID_CLASSES = new Set(["solid", "playerclip", "slick", "ladder"]);
// Probe from just above the feet down to 24 units below them.
const PROBE_LIFT = 2;
const PROBE_DEPTH = 24;

/**
 * Raycasts work on hidden meshes (three tests layers, not visibility), so the collision layer can
 * stay hidden. Each collision node carries one surfaceFlags value (a mapconv contract).
 * ponytail: plain three raycasts without a BVH; fine for a few probes per second, add a BVH if
 * probes ever run per frame.
 */
function createCollisionProbe(root: Object3D): CollisionProbe {
  const solids: Object3D[] = [];
  const flags = new Set<number>();
  root.traverse((object) => {
    if (!PLAYER_SOLID_CLASSES.has(collisionClass(object))) return;
    const value = surfaceFlagsOf(object);
    if ((object as Partial<Mesh>).isMesh) solids.push(object);
    if (value !== null) flags.add(value);
  });
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const origin = new Vector3();
  raycaster.far = (PROBE_LIFT + PROBE_DEPTH) * METRES_PER_COD_UNIT;
  return {
    surfaceFlags: [...flags],
    surfaceFlagsBelow(x, y, z) {
      origin.set(...codToScenePosition(x, y, z + PROBE_LIFT));
      raycaster.set(origin, down);
      const hit = raycaster.intersectObjects(solids, false)[0];
      return hit ? surfaceFlagsOf(hit.object) : null;
    },
  };
}

function surfaceFlagsOf(object: Object3D | null): number | null {
  for (let current = object; current; current = current.parent) {
    const value: unknown = current.userData.surfaceFlags;
    if (typeof value === "number") return value;
  }
  return null;
}

function nameOf(object: Object3D): string {
  const original: unknown = object.userData.name;
  return typeof original === "string" ? original : object.name;
}

function collisionClass(object: Object3D | null): string {
  for (let current = object; current; current = current.parent) {
    const name = nameOf(current);
    if (name.startsWith("collision/")) return name.slice("collision/".length);
  }
  return "other";
}

function listLayers(
  root: Object3D,
  objects: Map<number, Object3D>,
  materials: MaterialCache,
): LayerItem[] {
  const items: LayerItem[] = [];
  objects.clear();
  for (const node of root.children) {
    const name = nameOf(node);
    objects.set(node.id, node);
    items.push({ id: node.id, name, child: false, visible: node.visible });
    // Layer children are named "<layer>/<class>"; render also holds its own primitives.
    for (const child of node.children) {
      const childName = nameOf(child);
      if (!childName.startsWith(`${name}/`)) continue;
      objects.set(child.id, child);
      items.push({
        id: child.id,
        name: childName,
        child: true,
        visible: child.visible,
        ...(name === "collision"
          ? { color: `#${materials.collision(collisionClass(child)).color.getHexString()}` }
          : {}),
      });
    }
  }
  return items;
}

interface MaterialCache {
  collision(kind: string): MeshLambertMaterial;
  dispose(): void;
}

/** Collision overlay materials; render materials come from the legacy surface extension. */
function createMaterialCache(): MaterialCache {
  const collision = new Map<string, MeshLambertMaterial>();

  return {
    collision(kind) {
      let material = collision.get(kind);
      if (!material) {
        material = new MeshLambertMaterial({
          color: COLLISION_COLORS[kind] ?? OTHER_COLLISION_COLOR,
          transparent: true,
          opacity: COLLISION_OPACITY,
          depthWrite: false,
          side: DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        collision.set(kind, material);
      }
      return material;
    },

    dispose() {
      for (const material of collision.values()) material.dispose();
    },
  };
}

function disposeObject(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((object) => {
    // Frees per-object GPU state, such as an InstancedMesh's instance buffers.
    object.dispose();
    const { geometry, material } = object as Partial<Mesh>;
    geometry?.dispose();
    if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
    else if (material) materials.add(material);
  });
  const textures = new Set<Texture>();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/**
 * Optional 3D map models. Every 3D entry point is hidden while VITE_MAP_MODEL_BASE_URL is unset.
 * The value is read per call so tests can stub the environment.
 */
export function getMapModelUrl(mapName: string): string | null {
  const base = modelBase();
  return base && mapName.trim() ? `${base}/${encodeURIComponent(mapName)}.glb` : null;
}

export function hasMapModels(): boolean {
  return modelBase() !== null;
}

/**
 * First-person weapon shown in replays.
 * ponytail: replays do not record the pistol, so every replay shows the default J4L Luger; the
 * donator Desert Eagle (`deagle_mp2`) needs a recorded weapon before it can be chosen per run.
 */
export const VIEWMODEL_WEAPON = "luger_mp2";

/**
 * First-person weapon model served beside the map models: the skinned viewmodel with its xanims as
 * glTF clips. The rigid `viewmodel/luger_mp2.glb` stays on the host for older deployed builds.
 */
export function getViewmodelUrl(): string | null {
  return modelAssetUrl(`viewmodel/${VIEWMODEL_WEAPON}_anims.glb`);
}

/** An asset served beside the map models (a path relative to the model base, as in sounds.json). */
export function modelAssetUrl(path: string): string | null {
  const base = modelBase();
  return base && `${base}/${path.replace(/^\/+/, "")}`;
}

function modelBase(): string | null {
  return import.meta.env.VITE_MAP_MODEL_BASE_URL?.trim().replace(/\/+$/, "") || null;
}

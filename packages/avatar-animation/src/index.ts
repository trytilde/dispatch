export { avatarShapes, type AvatarShape } from "./shapes.js";

export const AVATAR_ASSET_BASE_URL = "https://trytilde.ai/avatar-assets/v1";

export const avatarEyeIds = [
  "1",
  "2",
  "4",
  "5",
  "10",
  "11",
  "12",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "59",
  "60",
] as const;
export const avatarShadeIds = ["1", "2", "3", "4", "5", "6"] as const;
export const avatarBackgrounds = {
  coral: "#FF5A5F",
  orange: "#FF8A3D",
  amber: "#FFC53D",
  lime: "#7ED957",
  green: "#2FD07A",
  teal: "#22D3C5",
  sky: "#38BDF8",
  blue: "#4F7CFF",
  violet: "#A66BFF",
  pink: "#FF5FA8",
} as const;
export const avatarShadeCoverage = {
  "1": 0,
  "2": 0.0935,
  "3": 0.1702,
  "4": 0.2492,
  "5": 0.4552,
  "6": 0.6018,
} as const;
export const avatarEyeMeta = {
  cropW: 760,
  cropH: 648,
  eyeCx: 255,
  eyeCy: 192,
  typWidth: 310,
} as const;

export type AvatarShapeId = keyof typeof import("./shapes.js").avatarShapes;
export type AvatarEyeId = (typeof avatarEyeIds)[number];
export type AvatarShadeId = (typeof avatarShadeIds)[number];
export type AvatarBackgroundId = keyof typeof avatarBackgrounds;

export interface AvatarIconDescriptor {
  type: "icon";
  version: "v1";
  shape: AvatarShapeId;
  eyes: AvatarEyeId;
  shade: AvatarShadeId;
  background: AvatarBackgroundId;
}

export type AgentAvatarState =
  | "idle"
  | "listening"
  | "thinking"
  | "working"
  | "loading"
  | "waiting"
  | "sleeping"
  | "happy";

export interface SpringState {
  x: number;
  v: number;
  t: number;
}

export function createSpring(value: number): SpringState {
  return { x: value, v: 0, t: value };
}

export function stepSpring(
  state: SpringState,
  frequency: number,
  damping: number,
  dt: number,
): void {
  state.v +=
    (-2 * damping * frequency * state.v - frequency * frequency * (state.x - state.t)) * dt;
  state.x += state.v * dt;
  if (!Number.isFinite(state.x) || !Number.isFinite(state.v)) {
    state.x = state.t;
    state.v = 0;
  }
}

export function isBusyAvatarState(state: AgentAvatarState): boolean {
  return state === "thinking" || state === "working" || state === "loading" || state === "waiting";
}

export function avatarAssetUrl(
  kind: "shapes" | "eyes" | "shades" | "backgrounds",
  id: string,
  baseUrl = AVATAR_ASSET_BASE_URL,
): string {
  const extension = kind === "eyes" || kind === "shades" ? "png" : "svg";
  return `${baseUrl}/${kind}/${encodeURIComponent(id)}.${extension}`;
}

export function createAvatarIcon(seed: string): AvatarIconDescriptor {
  const shapes = Object.keys(importedAvatarShapes) as AvatarShapeId[];
  const backgrounds = Object.keys(avatarBackgrounds) as AvatarBackgroundId[];
  const lightShades = avatarShadeIds.filter((id) => avatarShadeCoverage[id] <= 0.25);
  return {
    type: "icon",
    version: "v1",
    shape: shapes[pick(seed, "shape", shapes.length)] ?? "blob",
    eyes: avatarEyeIds[pick(seed, "eyes", avatarEyeIds.length)] ?? "1",
    shade: lightShades[pick(seed, "shade", lightShades.length)] ?? "1",
    background: backgrounds[pick(seed, "background", backgrounds.length)] ?? "coral",
  };
}

export function backgroundColor(id: AvatarBackgroundId): string {
  return avatarBackgrounds[id];
}

export function pick(seed: string, salt: string, count: number): number {
  let hash = fnv1a(`${seed}/${salt}`);
  hash = Math.imul(hash ^ (hash >>> 16), 73_244_475);
  hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_909);
  return ((hash ^ (hash >>> 16)) >>> 0) % count;
}

export function fnv1a(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

import { avatarShapes as importedAvatarShapes } from "./shapes.js";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  avatarAssetUrl,
  avatarBackgrounds,
  avatarEyeMeta,
  avatarShadeCoverage,
  avatarShapes,
  backgroundColor,
  createAvatarIcon,
  createSpring,
  isBusyAvatarState,
  pick,
  stepSpring,
  type AgentAvatarState,
  type AvatarIconDescriptor,
  type AvatarShapeId,
} from "@tryopenbot/avatar-animation";

/* ─────────────────────────────────────────────────────────
 * AGENT AVATAR
 * A coloured silhouette with a halftone tone field multiplied
 * over it and drawn eyes used as luminance masks. The eyes
 * drift and blink on springs; busy states spin a yellow
 * orbit of ribbons around the body.
 * ───────────────────────────────────────────────────────── */

export type { AgentAvatarState } from "@tryopenbot/avatar-animation";

export const shapeNames = Object.keys(avatarShapes) as readonly string[];
export type AgentAvatarShapeName = AvatarShapeId;

/** Body colours, keyed off the agent id so an agent keeps its colour.
 * Bright, saturated hues with a wide spread — each stays legible once the
 * halftone field multiplies over it, so avatars read as colour, not mud. */
export const agentAvatarPalette = Object.values(avatarBackgrounds);

const ORBIT_YELLOW = "#FFD34D";
const INK = "#191919";
const CENTER = 114.27;
const EYE_TARGET_WIDTH = 104;

/** Where the eyes sit inside each 228-unit silhouette. */
const FACE: Record<string, { eyeY: number; gap: number }> = {
  blob: { eyeY: 92, gap: 46 },
  pebble: { eyeY: 96, gap: 48 },
  squircle: { eyeY: 92, gap: 48 },
  tablet: { eyeY: 106, gap: 52 },
  wedge: { eyeY: 128, gap: 38 },
  hex: { eyeY: 96, gap: 46 },
  cloud: { eyeY: 108, gap: 46 },
  teardrop: { eyeY: 124, gap: 42 },
};

export interface AgentAvatarProps {
  id: string;
  state?: AgentAvatarState;
  paused?: boolean;
  className?: string;
  /** Explicit body colour; defaults to the id-derived palette entry. */
  color?: string;
  /** Explicit silhouette; defaults to the id-derived shape. */
  shape?: AgentAvatarShapeName;
  /** Persisted catalog descriptor; defaults to a deterministic id-derived icon. */
  icon?: AvatarIconDescriptor;
  /** Retained for call-site compatibility; the eyes drift on their own. */
  emphasis?: boolean;
}

export function AgentAvatar({
  id,
  state = "idle",
  paused = false,
  className,
  color: colorOverride,
  shape: shapeOverride,
  icon,
}: AgentAvatarProps) {
  // SVG url(#id) references must be plain ASCII, so mint our own ids.
  const [uid] = useState(nextAvatarUid);
  const busy = isBusyAvatarState(state);

  const look = useMemo(() => {
    const descriptor = icon ?? createAvatarIcon(id);
    const shapeName = shapeOverride ?? descriptor.shape;
    const shape = avatarShapes[shapeName] ?? avatarShapes.blob;
    return {
      shapeName,
      shape,
      face: FACE[shapeName] ?? FACE.blob,
      color: colorOverride ?? backgroundColor(descriptor.background),
      toneCoverage: avatarShadeCoverage[descriptor.shade],
      toneUrl: avatarAssetUrl("shades", descriptor.shade),
      eyeMaskUrl: avatarAssetUrl("eyes", descriptor.eyes),
    };
  }, [id, colorOverride, shapeOverride, icon]);

  const eyesRef = useRef<SVGGElement>(null);
  const orbitBackRef = useRef<SVGGElement>(null);
  const orbitFrontRef = useRef<SVGGElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Eye geometry, shared by every variant so relative placement is as drawn.
  const eyeBox = useMemo(() => {
    const scale = EYE_TARGET_WIDTH / avatarEyeMeta.typWidth;
    return {
      x: CENTER - avatarEyeMeta.eyeCx * scale,
      y: look.face.eyeY - avatarEyeMeta.eyeCy * scale,
      width: avatarEyeMeta.cropW * scale,
      height: avatarEyeMeta.cropH * scale,
    };
  }, [look.face.eyeY]);

  const ribbons = useMemo(() => makeRibbons(id), [id]);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const eyes = eyesRef.current;
    if (!eyes) return;

    const gazeX = createSpring(0);
    const gazeY = createSpring(0);
    const lid = createSpring(0);
    let nextWander = performance.now() + randomBetween(600, 3200);
    let nextBlink = performance.now() + randomBetween(1400, 4200);
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (now >= nextWander) {
        if (Math.random() < 0.45) {
          gazeX.t = 0;
          gazeY.t = 0;
        } else {
          gazeX.t = randomBetween(-6, 6);
          gazeY.t = randomBetween(-3, 3);
        }
        nextWander = now + randomBetween(3200, 7500);
      }
      if (now >= nextBlink) {
        lid.x = 1;
        nextBlink = now + randomBetween(1800, 5600);
      }

      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        stepSpring(gazeX, 6, 0.9, h);
        stepSpring(gazeY, 6, 0.9, h);
        stepSpring(lid, 26, 1, h);
      }

      const squash = Math.max(0.06, 1 - clamp(lid.x, 0, 1));
      eyes.setAttribute(
        "transform",
        `translate(${gazeX.x.toFixed(2)} ${gazeY.x.toFixed(2)}) ` +
          `translate(${CENTER} ${look.face.eyeY}) scale(1 ${squash.toFixed(3)}) ` +
          `translate(${-CENTER} ${-look.face.eyeY})`,
      );

      if (busyRef.current) drawOrbit(ribbons, dt, orbitBackRef.current, orbitFrontRef.current);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [paused, look.face.eyeY, ribbons]);

  const clipId = `avatar-clip-${uid}`;
  const maskId = `avatar-eyes-${uid}`;

  return (
    <span
      aria-hidden="true"
      className={`avatar relative flex size-9 shrink-0 items-center justify-center ${className ?? ""}`}
      data-avatar-key={id}
      data-avatar-shape={look.shapeName}
      data-avatar-state={state}
      style={{ color: INK } as CSSProperties}
    >
      <svg
        className="agent-avatar-orbit absolute -inset-[4%] transition-opacity duration-200"
        style={{ opacity: busy ? 1 : 0, zIndex: 0 }}
        viewBox="0 0 100 100"
      >
        <g ref={orbitBackRef} opacity="0.5" />
      </svg>
      <svg
        className="agent-avatar-mark relative h-full w-full"
        style={{ zIndex: 1 }}
        viewBox={look.shape.viewBox}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={look.shape.d} fillRule="evenodd" />
          </clipPath>
          <mask id={maskId} maskUnits="userSpaceOnUse" {...eyeBox}>
            <image href={look.eyeMaskUrl} preserveAspectRatio="none" {...eyeBox} />
          </mask>
        </defs>
        <g transform={look.shape.transform} style={{ isolation: "isolate" }}>
          <path
            className="agent-avatar-body"
            d={look.shape.d}
            fill={look.color}
            fillRule="evenodd"
            stroke={INK}
            strokeLinejoin="round"
            strokeWidth="4"
          />
          {look.toneCoverage > 0 ? (
            <g clipPath={`url(#${clipId})`} style={{ mixBlendMode: "multiply" }}>
              <image
                href={look.toneUrl}
                x={-30}
                y={-30}
                width={300}
                height={300}
                preserveAspectRatio="none"
              />
            </g>
          ) : null}
          <g clipPath={`url(#${clipId})`}>
            <g ref={eyesRef}>
              <rect {...eyeBox} fill={INK} mask={`url(#${maskId})`} />
            </g>
          </g>
        </g>
      </svg>
      <svg
        className="agent-avatar-orbit absolute -inset-[4%] transition-opacity duration-200"
        style={{ opacity: busy ? 1 : 0, zIndex: 2 }}
        viewBox="0 0 100 100"
      >
        <g ref={orbitFrontRef} opacity="0.95" />
      </svg>
    </span>
  );
}

/* ── orbit ribbons ─────────────────────────────────────────
 * Four ribbons share one tilted BL→TR plane. Each sample is
 * split into a back and front run by its depth, so the body
 * sits inside the orbit rather than on top of it. */
interface Ribbon {
  lam: number;
  vel: number;
  tilt: number;
  roll: number;
  rad: number;
  arc: number;
  width: number;
}

function makeRibbons(seed: string): Ribbon[] {
  return Array.from({ length: 4 }, (_, i) => ({
    lam: pick(seed, `olam${i}`, 628) / 100,
    vel: 0.95 + pick(seed, `ovel${i}`, 40) / 100,
    tilt: 0.34 + pick(seed, `otilt${i}`, 10) / 100,
    roll: -Math.PI / 4 + (pick(seed, `oroll${i}`, 12) - 6) / 100,
    rad: 43 + i * 2.4,
    arc: 2.2 + pick(seed, `oarc${i}`, 120) / 100,
    width: 2 + (pick(seed, `ow${i}`, 10) / 10) * 1.2,
  }));
}

function drawOrbit(
  ribbons: Ribbon[],
  dt: number,
  back: SVGGElement | null,
  front: SVGGElement | null,
): void {
  if (!back || !front) return;
  ensurePaths(back, ribbons, 1);
  ensurePaths(front, ribbons, 1.15);

  ribbons.forEach((ribbon, index) => {
    ribbon.lam += ribbon.vel * dt;
    const SAMPLES = 26;
    let backD = "";
    let frontD = "";
    let run = "";
    let runIsFront: boolean | null = null;

    for (let s = 0; s <= SAMPLES; s += 1) {
      const a = ribbon.lam - ribbon.arc + (s / SAMPLES) * ribbon.arc;
      const sx = ribbon.rad * Math.sin(a);
      const sy = -ribbon.rad * Math.cos(a) * Math.sin(ribbon.tilt);
      const x = 50 + sx * Math.cos(ribbon.roll) - sy * Math.sin(ribbon.roll);
      const y = 50 + sx * Math.sin(ribbon.roll) + sy * Math.cos(ribbon.roll);
      const isFront = Math.cos(a) * Math.cos(ribbon.tilt) >= 0;
      if (runIsFront === null || isFront !== runIsFront) {
        if (run) {
          if (runIsFront) frontD += run;
          else backD += run;
        }
        run = `M ${x.toFixed(1)} ${y.toFixed(1)} `;
        runIsFront = isFront;
      } else {
        run += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
      }
    }
    if (run) {
      if (runIsFront) frontD += run;
      else backD += run;
    }
    back.children[index]?.setAttribute("d", backD);
    front.children[index]?.setAttribute("d", frontD);
  });
}

function ensurePaths(group: SVGGElement, ribbons: Ribbon[], widthScale: number): void {
  while (group.childElementCount < ribbons.length) {
    const index = group.childElementCount;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", ORBIT_YELLOW);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-width", String((ribbons[index]?.width ?? 2) * widthScale));
    group.appendChild(path);
  }
}

let avatarUidCounter = 0;
function nextAvatarUid(): string {
  avatarUidCounter += 1;
  return `a${avatarUidCounter}`;
}

/* ── springs ───────────────────────────────────────────── */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/* Renders the store icons from the shared AgentAvatar artwork so the launcher
 * mark is the same drawing the app uses for its agents. The look is fixed here
 * rather than derived from an agent id: an icon must not change when the id
 * hashing does. Requires `@tryopenbot/ui` to be built, because the silhouette,
 * halftone and eye artwork live in its compiled assets module.
 *
 * Regenerate with `node scripts/generate-mobile-icons.mjs`. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDirectory = join(repositoryRoot, "apps/mobile/assets");
const assetsModule = join(repositoryRoot, "packages/ui/dist/agent-avatar-assets.js");

/* Tilde publishes the app, so the field carries Tilde's brand blues rather than
 * the avatar palette: navy lit from the top right by the electric blue, the same
 * pair Tilde uses for its own store covers. The body stays a plain white avatar. */
const TILDE_NAVY = "#001F6B";
const TILDE_ELECTRIC_BLUE = "0, 56, 174";
const LOOK = { shape: "blob", tone: "1", eyes: "28", color: "#FFFFFF" };
const FIELD = [
  "radial-gradient(110% 110% at 86% 8%,",
  `rgba(${TILDE_ELECTRIC_BLUE}, 0.95),`,
  `rgba(${TILDE_ELECTRIC_BLUE}, 0.35) 42%,`,
  `rgba(${TILDE_ELECTRIC_BLUE}, 0) 75%),`,
  TILDE_NAVY,
].join(" ");
const INK = "#191919";
const SIZE = 1024;
/* iOS shows the icon square with its own mask, so the body can run wide.
 * Android masks the foreground layer to a circle covering about two thirds
 * of the canvas, so its body sits well inside that safe area. */
const IOS_BODY = 0.74;
const ANDROID_BODY = 0.62;

const CENTER = 114.27;
const EYE_TARGET_WIDTH = 104;
const BLOB_EYE_Y = 92;

let assets;
try {
  assets = await import(assetsModule);
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  throw new Error("Build @tryopenbot/ui first: pnpm --filter @tryopenbot/ui build");
}
const { avatarEyeMasks, avatarEyeMeta, avatarShapes, avatarTones } = assets;

function avatarSvg() {
  const shape = avatarShapes[LOOK.shape];
  const tone = avatarTones[LOOK.tone];
  const eyeMask = avatarEyeMasks[LOOK.eyes];
  if (!shape || !tone || !eyeMask) throw new Error("Avatar assets no longer contain the icon look");

  const scale = EYE_TARGET_WIDTH / avatarEyeMeta.typWidth;
  const eyes = [
    `x="${CENTER - avatarEyeMeta.eyeCx * scale}"`,
    `y="${BLOB_EYE_Y - avatarEyeMeta.eyeCy * scale}"`,
    `width="${avatarEyeMeta.cropW * scale}"`,
    `height="${avatarEyeMeta.cropH * scale}"`,
  ].join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}">
  <defs>
    <clipPath id="body"><path d="${shape.d}" clip-rule="evenodd"/></clipPath>
    <mask id="eyes" maskUnits="userSpaceOnUse" ${eyes}>
      <image href="data:image/png;base64,${eyeMask}" preserveAspectRatio="none" ${eyes}/>
    </mask>
  </defs>
  <g transform="${shape.transform}" style="isolation:isolate">
    <path d="${shape.d}" fill="${LOOK.color}" fill-rule="evenodd" stroke="${INK}" stroke-linejoin="round" stroke-width="4"/>
    ${tone.cov > 0 ? `<g clip-path="url(#body)" style="mix-blend-mode:multiply"><image href="data:image/png;base64,${tone.png}" x="-30" y="-30" width="300" height="300" preserveAspectRatio="none"/></g>` : ""}
    <g clip-path="url(#body)"><rect ${eyes} fill="${INK}" mask="url(#eyes)"/></g>
  </g>
</svg>`;
}

function page(bodyFraction, background) {
  const body = SIZE * bodyFraction;
  return `<body style="margin:0;width:${SIZE}px;height:${SIZE}px;background:${background};display:flex">
  <div style="width:${body}px;height:${body}px;margin:auto">${avatarSvg()}</div>
</body>`;
}

const browser = await chromium.launch();
try {
  const view = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1,
  });
  await mkdir(assetsDirectory, { recursive: true });

  /* The App Store rejects a transparent icon, so iOS gets the opaque field. */
  await view.setContent(page(IOS_BODY, FIELD));
  await writeFile(join(assetsDirectory, "icon.png"), await view.screenshot());

  /* Android composes two layers, so the body ships transparent and the lit field
   * ships as the background layer. adaptiveIcon.backgroundColor stays as the
   * flat fallback for launchers that ignore the image. */
  await view.setContent(page(ANDROID_BODY, "transparent"));
  await writeFile(
    join(assetsDirectory, "adaptive-icon.png"),
    await view.screenshot({ omitBackground: true }),
  );

  await view.setContent(
    `<body style="margin:0;width:${SIZE}px;height:${SIZE}px;background:${FIELD}"></body>`,
  );
  await writeFile(join(assetsDirectory, "adaptive-background.png"), await view.screenshot());
} finally {
  await browser.close();
}

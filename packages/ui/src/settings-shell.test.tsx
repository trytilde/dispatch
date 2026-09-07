import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppearanceSettings, SettingsShell, SettingsContent } from "./settings-shell.js";

describe("settings presentation extraction", () => {
  it("preserves section routes, active semantics, content width and desktop drag region", () => {
    const html = renderToStaticMarkup(
      <SettingsShell
        section="tools"
        macDesktop
        onBack={() => undefined}
        onNavigate={() => undefined}
      >
        <SettingsContent width="wide">Catalog</SettingsContent>
      </SettingsShell>,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-settings-width="wide"');
    expect(html).toContain("pt-[42px]");
    expect(html).toContain("Open settings navigation");
    for (const label of ["General", "Tools", "Skills", "Routines", "Catalog"])
      expect(html).toContain(label);
  });
  it("keeps appearance selection controlled by the host", () => {
    const html = renderToStaticMarkup(
      <AppearanceSettings theme="dark" onThemeChange={() => undefined} />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Follow the operating system or pin a single theme.");
  });
});

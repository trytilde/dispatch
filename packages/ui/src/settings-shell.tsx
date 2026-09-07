"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { MenuIcon } from "lucide-react";
import { BackIcon, ClockIcon, PluginsIcon, SettingsIcon, SignalsIcon } from "./workspace-icons.js";
import { Sheet, SheetContent, SheetTitle } from "./components/ui/sheet.js";
import type { ThemePreference } from "./theme.js";
const settingsSections = [
  { id: "general", label: "General", icon: SettingsIcon, to: "/settings/general" },
] as const;

const pluginSections = [
  { id: "tools", label: "Tools", icon: PluginsIcon, to: "/settings/plugins/tools" },
  { id: "skills", label: "Skills", icon: SignalsIcon, to: "/settings/plugins/skills" },
  { id: "routines", label: "Routines", icon: ClockIcon, to: "/settings/plugins/routines" },
] as const;

const sections = [...settingsSections, ...pluginSections] as const;

const themeOptions: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const pageTransition = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;

export type SettingsSection = (typeof sections)[number]["id"];
export type SettingsDestination = (typeof sections)[number]["to"];
export interface SettingsShellProps {
  children: ReactNode;
  section: SettingsSection;
  onBack: () => void;
  onNavigate: (to: SettingsDestination) => void;
  macDesktop?: boolean;
}
export function SettingsShell({
  children,
  section,
  onBack,
  onNavigate,
  macDesktop = false,
}: SettingsShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  return (
    <motion.main
      animate={{ opacity: 1 }}
      className="flex h-screen w-full bg-page text-ink max-[720px]:flex-col"
      initial={{ opacity: 0 }}
      transition={pageTransition}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[3] h-8 max-[720px]:hidden"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      />
      <div
        className="hidden h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2
          pt-[env(safe-area-inset-top)] max-[720px]:flex"
      >
        <button
          aria-label="Back to workspace"
          className="grid size-11 place-items-center rounded-control text-ink-2 hover:bg-hover
            hover:text-ink"
          onClick={onBack}
          type="button"
        >
          <BackIcon className="size-4 shrink-0 fill-none stroke-current stroke-[1.3]" />
        </button>
        <strong className="min-w-0 flex-1 text-[15px] font-semibold text-ink">Settings</strong>
        <button
          aria-label="Open settings navigation"
          className="grid size-11 place-items-center rounded-control text-ink-2 hover:bg-hover
            hover:text-ink"
          onClick={() => setMobileNavigationOpen(true)}
          type="button"
        >
          <MenuIcon aria-hidden className="size-5" />
        </button>
      </div>

      <SettingsNavigation
        className={`flex w-[248px] shrink-0 ${macDesktop ? "pt-[42px]" : "pt-3"}
          max-[720px]:hidden`}
        onBack={onBack}
        onNavigate={onNavigate}
        section={section}
      />

      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent
          className="max-h-[min(72dvh,620px)] overflow-hidden bg-surface pb-[env(safe-area-inset-bottom)]"
          side="bottom"
        >
          <SheetTitle className="sr-only">Settings navigation</SheetTitle>
          <SettingsNavigation
            className="min-h-0 w-full overflow-y-auto pt-5"
            onBack={onBack}
            onNavigate={(to) => {
              setMobileNavigationOpen(false);
              onNavigate(to);
            }}
            section={section}
          />
        </SheetContent>
      </Sheet>

      <section className="min-w-0 flex-1 overflow-y-auto">{children}</section>
    </motion.main>
  );
}
export interface SettingsContentProps {
  children: ReactNode;
  width: "constrained" | "wide";
}

export function SettingsContent({ children, width }: SettingsContentProps) {
  const maxWidth = width === "wide" ? "max-w-[1280px]" : "max-w-[640px]";
  return (
    <div
      className={`${maxWidth} mx-auto w-full px-8 py-10 max-[720px]:px-[18px] max-[720px]:pt-5
        max-[720px]:pb-9`}
      data-settings-width={width}
    >
      {children}
    </div>
  );
}

export function SettingsNavigation({
  className,
  onBack,
  onNavigate,
  section,
}: {
  className?: string;
  onBack: () => void;
  onNavigate: (to: (typeof sections)[number]["to"]) => void;
  section: (typeof sections)[number]["id"];
}) {
  return (
    <aside
      className={`${className ?? ""} flex-col gap-1 border-r border-line bg-surface px-3 pb-3
        max-[720px]:border-0`}
    >
      <button
        aria-label="Back to workspace"
        className="relative z-[4] mb-2 flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left
          text-[12.5px] font-medium text-ink-2 transition-[background-color,color] duration-150
          hover:bg-hover hover:text-ink max-[720px]:hidden"
        onClick={onBack}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        type="button"
      >
        <BackIcon className="size-4 shrink-0 fill-none stroke-current stroke-[1.3]" />
        Back
      </button>
      <h1 className="px-2.5 pb-1 text-[13px] font-semibold text-ink">Settings</h1>
      {settingsSections.map((item) => {
        const Icon = item.icon;
        const selected = item.id === section;
        return (
          <button
            aria-current={selected ? "page" : undefined}
            className={`flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left
                text-[12.5px] font-medium transition-[background-color,color] duration-150
                hover:bg-hover hover:text-ink ${selected ? "bg-hover-2 text-ink" : "text-ink-2"}`}
            key={item.id}
            onClick={() => onNavigate(item.to)}
            type="button"
          >
            <Icon className="size-4 shrink-0 fill-none stroke-current stroke-[1.3]" />
            {item.label}
          </button>
        );
      })}
      <h2 className="px-2.5 pt-4 pb-1 text-[13px] font-semibold text-ink">Plugins</h2>
      {pluginSections.map((item) => {
        const Icon = item.icon;
        const selected = item.id === section;
        return (
          <button
            aria-current={selected ? "page" : undefined}
            className={`flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left
                text-[12.5px] font-medium transition-[background-color,color] duration-150
                hover:bg-hover hover:text-ink ${selected ? "bg-hover-2 text-ink" : "text-ink-2"}`}
            key={item.id}
            onClick={() => onNavigate(item.to)}
            type="button"
          >
            <Icon className="size-4 shrink-0 fill-none stroke-current stroke-[1.3]" />
            {item.label}
          </button>
        );
      })}
    </aside>
  );
}

export function AppearanceSettings({
  theme,
  onThemeChange,
}: {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[12px] bg-surface p-4 shadow-hairline">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-medium text-ink">Appearance</h3>
        <p className="text-[12.5px] text-ink-3">
          Follow the operating system or pin a single theme.
        </p>
      </div>
      <div className="flex gap-1.5">
        {themeOptions.map((option) => (
          <button
            aria-pressed={theme === option.value}
            className={`h-8 rounded-control px-3 text-[12.5px] font-medium
                    transition-[background-color,color] duration-150 hover:bg-hover
                    ${theme === option.value ? "bg-hover-2 text-ink" : "text-ink-2"}`}
            key={option.value}
            onClick={() => {
              onThemeChange(option.value);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

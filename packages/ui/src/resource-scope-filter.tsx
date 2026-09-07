import { ToggleGroup } from "radix-ui";
import type { ResourceScope } from "@tryopenbot/client-runtime";
/** Tabs-style segmented input; it filters the existing list rather than mounting tab panels. */
export function ResourceScopeFilter({
  value,
  onChange,
}: {
  value: ResourceScope;
  onChange: (value: ResourceScope) => void;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(value) => {
        if (value === "all" || value === "personal" || value === "bots") onChange(value);
      }}
      className="resource-scope-filter"
      aria-label="Resource scope"
    >
      <ToggleGroup.Item value="all">All</ToggleGroup.Item>
      <ToggleGroup.Item value="personal">Personal</ToggleGroup.Item>
      <ToggleGroup.Item value="bots">Bots</ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}

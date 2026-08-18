import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/theme/colors";

export function useColor(
  colorName: keyof typeof Colors.light,
  props?: { light?: string; dark?: string },
) {
  const theme = useColorScheme() ?? "light";
  const colorFromProps = props?.[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}

import { z } from "zod";

export const ControlServiceHealthSchema = z.object({
  ok: z.literal(true),
  service: z.literal("dispatch"),
});
export type ControlServiceHealth = z.infer<typeof ControlServiceHealthSchema>;

export const NativeAuthConfigurationSchema = z.object({
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  client_id: z.string().min(1),
  scope: z.string().min(1),
});
export type NativeAuthConfiguration = z.infer<typeof NativeAuthConfigurationSchema>;

export interface ClientInstallation extends NativeAuthConfiguration {
  control_origin: string;
}

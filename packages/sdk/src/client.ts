import { IdentitiesClient, type CreateIdentityInput, type LinkIdentityInput } from "./identities";
import { ChatKitClient, MessagesClient } from "./chatkit";
import type { Config } from "./config";
import { createConfig, type NormalizedConfig } from "./config";
import { SkillsClient } from "./skills";
import { McpClient } from "./tools";
import { BillingClient } from "./billing";
import { MemoryClient } from "./memory";

export class Client {
  readonly config: NormalizedConfig;
  readonly mcp: McpClient;
  readonly chatkit: ChatKitClient;
  readonly messages: MessagesClient;
  readonly skills: SkillsClient;
  readonly billing: BillingClient;
  readonly memory: MemoryClient;
  readonly identities: IdentitiesClient;

  constructor(config: Config = {}) {
    this.config = createConfig(config);
    this.identities = new IdentitiesClient(this.config);
    this.messages = new MessagesClient(this.config);
    this.mcp = new McpClient(this.config);
    this.chatkit = new ChatKitClient(this.config);
    this.skills = new SkillsClient(this.config);
    this.billing = new BillingClient(this.config);
    this.memory = new MemoryClient(this.config);
  }
  createIdentity(input: CreateIdentityInput) {
    return this.identities.create(input);
  }

  linkIdentity(input: LinkIdentityInput) {
    return this.identities.link(input);
  }

  /** Bind a new client without changing another request’s identity or team. */
  forTeam(input: { teamId: string; identityId: string }): Client {
    return new Client({ ...this.config, ...input });
  }
}

export function createClient(config: Config = {}): Client {
  return new Client(config);
}

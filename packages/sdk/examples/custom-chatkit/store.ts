import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ProviderInboundMessage,
  ProviderObject,
} from "@trytilde/sdk/chatkit-provider";

export type StoredConnection = {
  orgId: string;
  teamId: string;
  runtimeToken: string;
  configuration: ProviderObject;
  secrets: ProviderObject;
};

/** Durable connection state and ingress drafts, encrypted using the host's key. */
export class ProviderStore {
  private readonly db: DatabaseSync;
  constructor(
    filename: string,
    private readonly encryptionKey: Uint8Array,
  ) {
    if (encryptionKey.byteLength !== 32)
      throw new Error("Provider store requires a 32-byte encryption key");
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS provider_state (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,id));",
    );
  }
  private encode(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }
  private decode<T>(payload: string): T {
    const data = Buffer.from(payload, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
  getConnection(id: string): StoredConnection {
    const row = this.db
      .prepare(
        "SELECT payload FROM provider_state WHERE kind='connection' AND id=?",
      )
      .get(id);
    if (!row) throw new Error("Provider connection not found");
    return this.decode<StoredConnection>(String(row.payload));
  }
  findConnection(id: string): StoredConnection | undefined {
    const row = this.db
      .prepare(
        "SELECT payload FROM provider_state WHERE kind='connection' AND id=?",
      )
      .get(id);
    return row ? this.decode<StoredConnection>(String(row.payload)) : undefined;
  }
  saveConnection(id: string, value: StoredConnection): void {
    this.db
      .prepare(
        "INSERT INTO provider_state(kind,id,payload) VALUES('connection',?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload",
      )
      .run(id, this.encode(value));
  }
  deleteConnection(id: string): void {
    this.db
      .prepare("DELETE FROM provider_state WHERE kind='connection' AND id=?")
      .run(id);
  }
  getEvent(
    connectionId: string,
    eventId: string,
  ): ProviderInboundMessage | undefined {
    const row = this.db
      .prepare("SELECT payload FROM provider_state WHERE kind='event' AND id=?")
      .get(JSON.stringify([connectionId, eventId]));
    return row
      ? this.decode<ProviderInboundMessage>(String(row.payload))
      : undefined;
  }
  /** A concurrent webhook retry adopts the first durable normalized payload. */
  saveEvent(
    connectionId: string,
    value: ProviderInboundMessage,
  ): ProviderInboundMessage {
    const id = JSON.stringify([connectionId, value.eventId]);
    this.db
      .prepare(
        "INSERT INTO provider_state(kind,id,payload) VALUES('event',?,?) ON CONFLICT(kind,id) DO NOTHING",
      )
      .run(id, this.encode(value));
    const saved = this.getEvent(connectionId, value.eventId);
    if (!saved) throw new Error("Event was not persisted");
    return saved;
  }
  getEffect(
    connectionId: string,
    executionId: string,
  ): ProviderObject | undefined {
    const row = this.db
      .prepare(
        "SELECT payload FROM provider_state WHERE kind='effect' AND id=?",
      )
      .get(JSON.stringify([connectionId, executionId]));
    return row ? this.decode<ProviderObject>(String(row.payload)) : undefined;
  }
  saveEffect(
    connectionId: string,
    executionId: string,
    value: ProviderObject,
  ): void {
    this.db
      .prepare(
        "INSERT INTO provider_state(kind,id,payload) VALUES('effect',?,?) ON CONFLICT(kind,id) DO NOTHING",
      )
      .run(JSON.stringify([connectionId, executionId]), this.encode(value));
  }
  getDelivery(
    id: string,
  ): { startedAt: number; route: string; body: ProviderObject } | undefined {
    const row = this.db
      .prepare(
        "SELECT payload FROM provider_state WHERE kind='delivery' AND id=?",
      )
      .get(id);
    return row ? this.decode(String(row.payload)) : undefined;
  }
  prepareDelivery(
    id: string,
    route: string,
    body: ProviderObject,
  ): { startedAt: number; route: string; body: ProviderObject } {
    this.db
      .prepare(
        "INSERT INTO provider_state(kind,id,payload) VALUES('delivery',?,?) ON CONFLICT(kind,id) DO NOTHING",
      )
      .run(id, this.encode({ startedAt: Date.now(), route, body }));
    const saved = this.getDelivery(id);
    if (!saved) throw new Error("Delivery intent was not persisted");
    return saved;
  }
  close(): void {
    this.db.close();
  }
}

export interface LegacyHost { name: string; host: string; port: number; user: string; identityFile: string; proxyJump: string }
export interface MigrationSelection { name: string; alias: string }
export interface MigrationPreview {
  token: string; configPath: string; fragmentPath: string;
  before: { config: string; fragment: string }; after: { config: string; fragment: string };
  hosts: Array<LegacyHost & { alias: string; error?: string }>;
  ready: boolean;
}
export interface MigrationResult { id: string; aliases: Record<string, string>; verified: string[]; errors: Record<string, string> }

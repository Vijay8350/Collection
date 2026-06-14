export type MigrationSource = "sc" | "shoppad" | "globo" | "easify" | "hulk";

export interface DetectedSource {
  source: MigrationSource;
  installed: boolean;
  productCount: number;
  optionSetEstimate: number;
  evidence: string[];
}

export interface ImportedOption {
  type: string;
  label: string;
  required: boolean;
  values?: { label: string; value: string; addonPriceCents?: number }[];
}

export interface ImportedOptionSet {
  externalId: string;
  name: string;
  options: ImportedOption[];
  appliedToProductIds: string[];
}

export interface ImporterContext {
  shopId: string;
  shopifyDomain: string;
  adminGraphql: (query: string, variables?: Record<string, unknown>) => Promise<any>;
}

export interface Importer {
  detect(ctx: ImporterContext): Promise<DetectedSource>;
  import(ctx: ImporterContext): AsyncGenerator<ImportedOptionSet, { totalImported: number }, void>;
}

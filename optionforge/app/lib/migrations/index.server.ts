import type { Importer, ImporterContext, ImportedOptionSet, MigrationSource } from "./types";
import { ScImporter } from "./sc.server";
import { ShopPadImporter } from "./shoppad.server";

const STAGE_2_PLACEHOLDER: Importer = {
  async detect(): Promise<any> {
    return {
      source: "globo",
      installed: false,
      productCount: 0,
      optionSetEstimate: 0,
      evidence: ["Importer for this source ships in Stage 2 of roadmap."],
    };
  },
  async *import() {
    return { totalImported: 0 };
  },
};

export const IMPORTERS: Record<MigrationSource, Importer> = {
  sc: ScImporter,
  shoppad: ShopPadImporter,
  globo: STAGE_2_PLACEHOLDER,
  easify: STAGE_2_PLACEHOLDER,
  hulk: STAGE_2_PLACEHOLDER,
};

export async function detectAllSources(ctx: ImporterContext) {
  const results = await Promise.all(
    (Object.keys(IMPORTERS) as MigrationSource[]).map(async (key) => {
      try {
        return await IMPORTERS[key].detect(ctx);
      } catch (err) {
        return {
          source: key,
          installed: false,
          productCount: 0,
          optionSetEstimate: 0,
          evidence: [`Detection error: ${(err as Error).message}`],
        };
      }
    }),
  );
  return results;
}

export async function runImport(
  source: MigrationSource,
  ctx: ImporterContext,
  onProgress: (imported: ImportedOptionSet) => Promise<void>,
): Promise<{ totalImported: number }> {
  const importer = IMPORTERS[source];
  const iter = importer.import(ctx);
  let total = 0;
  while (true) {
    const next = await iter.next();
    if (next.done) {
      return next.value ?? { totalImported: total };
    }
    await onProgress(next.value);
    total += 1;
  }
}

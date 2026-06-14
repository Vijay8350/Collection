import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_TEMPLATES = [
  {
    slug: "engraved-jewelry",
    name: "Engraved Jewelry",
    category: "jewelry",
    locale: "en",
    jsonDefinition: JSON.stringify({
      options: [
        { type: "text", label: "Engraving text", required: true, validation: { maxLength: 20 } },
        { type: "dropdown", label: "Font", required: true, values: [
          { label: "Serif", value: "serif" },
          { label: "Script", value: "script" },
          { label: "Modern", value: "modern" },
        ]},
        { type: "swatch_color", label: "Metal color", values: [
          { label: "Gold", value: "gold", swatchColor: "#FFD700" },
          { label: "Silver", value: "silver", swatchColor: "#C0C0C0" },
          { label: "Rose Gold", value: "rose-gold", swatchColor: "#B76E79" },
        ]},
      ],
    }),
  },
  {
    slug: "custom-apparel",
    name: "Custom Apparel (Name + Number)",
    category: "apparel",
    locale: "en",
    jsonDefinition: JSON.stringify({
      options: [
        { type: "text", label: "Name on back", required: true, validation: { maxLength: 16 } },
        { type: "number", label: "Jersey number", validation: { min: 0, max: 99 } },
        { type: "dropdown", label: "Size", required: true, values: ["XS", "S", "M", "L", "XL", "XXL"].map(s => ({ label: s, value: s })) },
      ],
    }),
  },
  {
    slug: "photo-print",
    name: "Photo Print",
    category: "print",
    locale: "en",
    jsonDefinition: JSON.stringify({
      options: [
        { type: "image_upload", label: "Upload your photo", required: true },
        { type: "dropdown", label: "Print size", required: true, values: [
          { label: '4×6"', value: "4x6", addonPriceCents: 0 },
          { label: '5×7"', value: "5x7", addonPriceCents: 300 },
          { label: '8×10"', value: "8x10", addonPriceCents: 700 },
        ]},
        { type: "radio", label: "Finish", values: [
          { label: "Matte", value: "matte" },
          { label: "Glossy", value: "glossy" },
        ]},
      ],
    }),
  },
];

async function main() {
  for (const tpl of SEED_TEMPLATES) {
    await prisma.template.upsert({
      where: { slug: tpl.slug },
      create: tpl,
      update: tpl,
    });
  }
  console.log(`Seeded ${SEED_TEMPLATES.length} templates`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

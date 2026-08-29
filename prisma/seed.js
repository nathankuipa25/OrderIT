const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const demoProducts = [
  "Coca-Cola 500ml",
  "Fanta 500ml",
  "Sprite 500ml",
  "Bread",
  "Milk",
  "Biscuits",
  "Cooking Oil 1L",
  "Rice 1kg",
  "Sugar 1kg",
  "Eggs (tray)",
];

async function main() {
  for (const name of demoProducts) {
    await prisma.product.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${demoProducts.length} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

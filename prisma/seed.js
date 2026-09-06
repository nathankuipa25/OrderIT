const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
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

async function seedProducts() {
  for (const name of demoProducts) {
    await prisma.product.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${demoProducts.length} products.`);
}

async function seedDefaultAdmin() {
  const username = "Nathan";
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log("Default admin already exists, skipping.");
    return;
  }
  const passwordHash = await bcrypt.hash("0624", 10);
  await prisma.user.create({
    data: {
      role: "ADMIN",
      name: "Nathan",
      username,
      passwordHash,
    },
  });
  console.log(
    "Seeded default admin (username: Nathan, password: 0624) — change this password after your first login."
  );
}

async function main() {
  await seedProducts();
  await seedDefaultAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

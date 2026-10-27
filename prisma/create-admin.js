const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const name = (process.env.ADMIN_NAME || username || "").trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !name || !password || password.length < 12) {
    throw new Error(
      "Set ADMIN_USERNAME, ADMIN_NAME (optional), and ADMIN_PASSWORD (at least 12 characters) for this one-time admin setup."
    );
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new Error(`An account named ${username} already exists; no changes made.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { role: "ADMIN", name, username, passwordHash },
  });
  console.log(`Created admin account ${username}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

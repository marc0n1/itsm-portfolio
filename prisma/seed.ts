import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORD = "demo1234";

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Empresa Demo", slug: "demo" },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const users = [
    { name: "Ana Admin", email: "admin@demo.com", role: "ADMIN" },
    { name: "Carlos Agente", email: "agente@demo.com", role: "AGENT" },
    { name: "Sara Solicitante", email: "solicitante@demo.com", role: "REQUESTER" },
  ] as const;

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash },
      create: { ...u, passwordHash, organizationId: org.id },
    });
  }

  console.log(`Seed ok: ${users.length} usuários na organização "${org.name}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

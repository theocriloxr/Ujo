import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const integrity = await prisma.$queryRawUnsafe('PRAGMA integrity_check');
  const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const healthy = Array.isArray(integrity) && integrity.every(row => row.integrity_check === 'ok');
  console.log(JSON.stringify({ databaseUrl: process.env.DATABASE_URL, healthy, integrity, tables }, null, 2));
  if (!healthy) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ databaseUrl: process.env.DATABASE_URL, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

export function databasePath(databaseUrl: string, projectRoot = process.cwd()): string {
  if (!databaseUrl.startsWith('file:')) throw new Error('Ujo currently requires a file: SQLite DATABASE_URL.');
  const raw = databaseUrl.slice('file:'.length).split('?')[0];
  if (!raw) throw new Error('DATABASE_URL does not contain a database path.');
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.resolve(projectRoot, 'prisma', raw);
}

export async function ensureDatabaseContainer(databaseUrl = process.env.DATABASE_URL || 'file:./ujo.db'): Promise<string> {
  const filename = databasePath(databaseUrl);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const database = new sqlite3.Database(filename, error => {
      if (error) return reject(error);
      database.close(closeError => closeError ? reject(closeError) : resolve());
    });
  });
  return filename;
}

if (process.argv[1]?.endsWith('bootstrap-db.ts')) {
  ensureDatabaseContainer()
    .then(filename => console.log(`Database container ready: ${filename}`))
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

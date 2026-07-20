import sqlite3 from 'sqlite3';

const filename = process.argv[2] ?? 'prisma/ujo_os_v2.db';
const db = new sqlite3.Database(filename);
const all = (sql) => new Promise((resolve, reject) => {
  db.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
});

try {
  const integrity = await all('PRAGMA integrity_check');
  const tables = await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log(JSON.stringify({ filename, integrity, tables }, null, 2));
  if (integrity.some(row => row.integrity_check !== 'ok')) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ filename, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  db.close();
}

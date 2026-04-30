import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function test() {
  try {
    const db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });
    await db.exec('CREATE TABLE test (id INTEGER)');
    await db.run('INSERT INTO test (id) VALUES (1)');
    const row = await db.get('SELECT * FROM test');
    console.log('SUCCESS:', row);
  } catch (err) {
    console.error('FAILURE:', err);
  }
}
test();

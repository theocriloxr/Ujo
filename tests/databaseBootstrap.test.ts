import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { databasePath } from '../scripts/bootstrap-db.ts';

test('relative Prisma SQLite URLs resolve beside the schema', () => {
  assert.equal(databasePath('file:./ujo.db', 'C:\\hub'), path.resolve('C:\\hub', 'prisma', './ujo.db'));
  assert.throws(() => databasePath('postgresql://localhost/ujo'), /requires a file:/);
});

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const allowed = new Set([
  '.gitignore', '.github/workflows/verify.yml', 'AGENTS.md', 'README.md', 'LICENSE_STATUS.md', 'SECURITY.md',
  'package.json', 'package-lock.json', 'tsconfig.json', 'src/index.ts', 'tests/bridge.test.mjs',
  'scripts/boundary.mjs', 'contracts/request.schema.json', 'contracts/request-fixtures.json',
]);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const failures = [];
const scan = (path, bytes, location) => {
  if (!allowed.has(path)) failures.push(`${location}: unreviewed path ${path}`);
  if (bytes.length > 512000 || bytes.includes(0)) failures.push(`${location}: unexpected binary/size ${path}`);
  const content = bytes.toString('utf8');
  const patterns = [
    /AIza[0-9A-Za-z_-]{35}/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{80,}?-----END/,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  ];
  if (patterns.some(pattern => pattern.test(content))) failures.push(`${location}: credential-pattern candidate ${path}`);
};
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
for (const path of new Set(files)) scan(path, readFileSync(path), 'working tree');
const commits = git('rev-list', 'HEAD').trim().split('\n').filter(Boolean);
const seen = new Set();
for (const commit of commits) {
  const entries = git('ls-tree', '-r', '-z', commit).split('\0').filter(Boolean);
  for (const entry of entries) {
    const [metadata, path] = entry.split('\t');
    const [mode, type, oid] = metadata.split(' ');
    if (type !== 'blob' || mode !== '100644') failures.push(`${commit}: unexpected object mode ${path}`);
    const key = `${path}:${oid}`;
    if (!seen.has(key)) {
      seen.add(key);
      scan(path, execFileSync('git', ['cat-file', 'blob', oid]), commit);
    }
  }
}
if (failures.length) { process.stderr.write(failures.join('\n') + '\n'); process.exit(1); }
console.log(JSON.stringify({ status: 'VERIFIED', scope: 'reviewed path allowlist and heuristic credential patterns only',
  files: new Set(files).size, reachableCommits: commits.length, historicalPathBlobs: seen.size,
  limits: 'Not proof of secret absence or legal clearance. Requires human content review.' }, null, 2));

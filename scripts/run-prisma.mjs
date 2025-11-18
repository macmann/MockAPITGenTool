#!/usr/bin/env node
import 'dotenv/config';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const prismaArgs = process.argv.slice(2);
if (prismaArgs.length === 0) {
  console.error('Usage: node scripts/run-prisma.mjs <prisma subcommand> [...args]');
  process.exit(1);
}

const cwd = process.cwd();
const schemaPath = join(cwd, 'prisma', 'schema.prisma');
const schema = await readFile(schemaPath, 'utf8');

const providerFromEnv = process.env.DATABASE_PROVIDER?.trim();
const databaseUrl = process.env.DATABASE_URL || '';
let provider = 'sqlite';
if (providerFromEnv) {
  provider = providerFromEnv;
} else if (databaseUrl.startsWith('postgresql')) {
  provider = 'postgresql';
}

if (!['sqlite', 'postgresql'].includes(provider)) {
  console.error(
    `Unsupported DATABASE_PROVIDER "${provider}". Use "sqlite" or "postgresql".`
  );
  process.exit(1);
}

const datasourceMatch = schema.match(/datasource\s+db\s+\{[\s\S]*?\}/);
if (!datasourceMatch) {
  console.error('Unable to locate datasource `db` block in prisma/schema.prisma');
  process.exit(1);
}

const updatedDatasource = datasourceMatch[0].replace(
  /provider\s*=\s*"[^"]+"/,
  `provider = "${provider}"`
);
const generatedSchema = schema.replace(datasourceMatch[0], updatedDatasource);

const tmpSchemaPath = join(
  cwd,
  'prisma',
  `schema.${provider}.${Date.now()}.generated.prisma`
);
await writeFile(tmpSchemaPath, generatedSchema, 'utf8');

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['prisma', ...prismaArgs, '--schema', tmpSchemaPath],
  {
    stdio: 'inherit',
    env: process.env,
  }
);

child.on('exit', async (code) => {
  try {
    await rm(tmpSchemaPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Warning: unable to remove temp schema ${tmpSchemaPath}:`, err.message);
    }
  }
  process.exitCode = code;
});

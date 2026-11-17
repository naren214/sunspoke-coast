import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url)),output=fileURLToPath(new URL('../.cache/loading-checks.mjs',import.meta.url));
await mkdir(new URL('../.cache/',import.meta.url),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('loading-checks.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',packages:'external',outfile:output});
const run=spawnSync(process.execPath,[output,...process.argv.slice(2)],{cwd:root,encoding:'utf8',timeout:60000});process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'');if(run.error)throw run.error;process.exit(run.status??1);

import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createClient} from './client.mjs';

async function prompt(label, secret = false) {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal');
  let muted = false;
  const output = new Writable({write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  }});
  const rl = createInterface({input: process.stdin, output, terminal: true});
  process.stdout.write(label);
  muted = secret;
  try {
    const answer = await rl.question('');
    if (!answer) throw new Error('Empty input');
    return answer;
  } finally {
    rl.close();
    if (secret) process.stdout.write('\n');
  }
}

async function main() {
  const mode = process.argv[2];
  const uploadOptions = mode === 'uploads' ? process.argv.slice(4) : [];
  const validUploads = mode === 'uploads' && process.argv.length >= 4 &&
    uploadOptions.every(option => ['--cleanup', '--originals'].includes(option)) && new Set(uploadOptions).size === uploadOptions.length;
  // batch <folder> [check_batch_live.py options]: one session (user A) uploads a whole folder (T34/T37).
  const batch = mode === 'batch' && process.argv.length >= 4;
  const evidence = mode === 'evidence';
  const backend = mode === 'backend';
  if (!['register', 'confirm', 'login', 'ab', 'uploads', 'batch', 'evidence', 'backend'].includes(mode)
      || (mode === 'uploads' ? !validUploads : process.argv.length !== 3 && !batch && !evidence && !backend)) {
    throw new Error('Usage: node tools/cognito/cli.mjs register|confirm|login|ab|uploads <source> [--cleanup] [--originals]|batch <folder> [--corrupt] [--limit N]');
  }
  const config = {poolId: process.env.USER_POOL_ID, clientId: process.env.USER_POOL_CLIENT_ID};
  if (config.poolId !== 'us-east-1_JP5FcOZMA' || config.clientId !== 'n509p2ooh8opklaphskhs68sc') {
    throw new Error('Expected Prometeo outputs.env configuration');
  }
  const clients = [];
  const make = () => { const c = createClient(config); clients.push(c); return c; };
  try {
    if (mode === 'register') {
      const c = make();
      const email = (await prompt('Email: ')).trim();
      let password = await prompt('Password (hidden): ', true);
      const result = await c.register(email, password);
      password = '';
      console.log(result.confirmed ? 'Account confirmed.' : 'Registration sent. Confirm the email code with the confirm command.');
    } else if (mode === 'confirm') {
      await make().confirm((await prompt('Email: ')).trim(), (await prompt('Email code (hidden): ', true)).trim());
      console.log('Email confirmed.');
    } else if (mode === 'login') {
      const c = make();
      const email = (await prompt('Email: ')).trim();
      let password = await prompt('Password (hidden): ', true);
      await c.login(email, password);
      password = '';
      console.log('SRP login succeeded. Token kept only in memory and discarded.');
    } else {
      const tokens = [];
      for (const label of batch || evidence ? ['A'] : ['A', 'B']) {
        const c = make();
        const email = (await prompt(`User ${label} email: `)).trim();
        let password = await prompt(`User ${label} password (hidden): `, true);
        tokens.push(await c.login(email, password));
        password = '';
      }
      const script = fileURLToPath(new URL({uploads: '../../api/check_uploads_live.py', batch: '../../api/check_batch_live.py', evidence: '../../api/check_evidence_live.py', backend: '../../api/check_backend_live.py'}[mode]
        ?? '../../api/check_projects_live.py', import.meta.url));
      const checks = mode === 'uploads' ? ['--source', process.argv[3], ...uploadOptions]
        : batch ? ['--dir', process.argv[3], ...process.argv.slice(4)]
        : evidence || backend ? process.argv.slice(3)
        : ['--output', '/tmp/prometeo-t33-ab.json'];
      const status = await new Promise((resolve, reject) => {
        const child = spawn(process.env.T33_PYTHON || 'python3.12', ['-I', script, ...checks], {
          env: {...process.env, T33_TOKEN_A: tokens[0], ...(tokens[1] ? {T33_TOKEN_B: tokens[1]} : {})}, stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', code => resolve(code ?? 1));
      });
      tokens.fill('');
      if (status !== 0) throw new Error('A/B check failed; review the local receipt');
    }
  } finally {
    for (const c of clients) c.clear();
  }
}

main().catch(error => {
  // SDK messages can contain account identifiers; never print responses/tokens/passwords.
  const code = String(error.code || error.name || 'Error').replace(/[^A-Za-z0-9_]/g, '');
  console.error('Cognito operation failed ('+code+'). Check configuration/account status; no session was saved.');
  process.exitCode = 1;
});

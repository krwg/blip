import { spawn } from 'child_process';
import electron from 'electron';

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, BLIP_VITE_DEV: '1' },
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));

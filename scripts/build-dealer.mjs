// Builds the dealer-ONLY bundle (dealers.deliteauto.com) — cross-platform replacement for
// `APP_TARGET=dealer vite build`. See Documentations MD/dealer-portal.md ("Deployment").
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, APP_TARGET: 'dealer' },
})
process.exit(result.status ?? 1)

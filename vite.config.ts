import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => {
  // A real build without the database keys would ship an app that cannot
  // save anything. Stop it here; `npm run build:demo` is the backendless build.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  if (command === 'build' && env.VITE_DEMO !== '1') {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !env[key])
    if (missing.length) {
      throw new Error(
        `Cannot build without ${missing.join(' and ')}. Copy .env.example to .env and fill them in, ` +
          'or run `npm run build:demo` for the demo.',
      )
    }
  }
  return { plugins: [react(), tailwindcss()] }
})

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isWeb = mode === 'web';

  return {
    plugins: [react()],
    base: isWeb ? (env.VITE_BASE || '/') : '/',

    resolve: isWeb ? {
      alias: [
        {
          find: /.*\/db\/database$/,
          replacement: path.resolve(__dirname, 'src/db/database.mock.ts'),
        },
      ],
    } : {},

    clearScreen: false,
    server: isWeb ? {} : {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
    },
  };
});

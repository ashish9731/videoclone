import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// tanstackStart picks up src/server.ts as the SSR entry by convention and
// regenerates the route tree; nitro packages the server build.
export default defineConfig({
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart(), viteReact(), nitro()],
});

import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ resolve: { alias: { "@": path.resolve("src") } }, test: { environment: "node", fileParallelism: false, testTimeout: 20000, hookTimeout: 20000 } });

import { testEnv, run } from "./test-env.mjs";
const env = testEnv();
run("node_modules/prisma/build/index.js", ["migrate", "deploy"], env);
run("node_modules/vitest/vitest.mjs", ["run", "tests/integration"], env);

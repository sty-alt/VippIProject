import { testEnv, run } from "./test-env.mjs";
const env = testEnv();
run("node_modules/prisma/build/index.js", ["migrate", "deploy"], env);
run("node_modules/@playwright/test/cli.js", ["test"], env);

import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
  define: {
    __GAMEYARD_BUILD__: JSON.stringify("hub@test"),
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

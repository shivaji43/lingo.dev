import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    snapshotSerializers: ["./src/react/shared/test-serializer.ts"],
  },
});

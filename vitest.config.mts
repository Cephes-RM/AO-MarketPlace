import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/**/*.{test,spec}.{ts,tsx}"],
    // CI should stay green until the team adds its first unit test.
    passWithNoTests: true,
  },
});

module.exports = {
  testEnvironment: "jsdom",
  roots: ["src", "tests/pdf/unit"],
  testMatch: ["**/__tests__/**/*.ts", "**/tests/pdf/unit/**/*.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tests/tsconfig.json" }] },
};

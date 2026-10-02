import { color } from "../color";
import { evaluateColorCalculation } from "../color-calculation";
import { Parser } from "../../syntax/parser";
import { Context } from "../../../core/context";

const calculate = (value: string): number => {
  const token = Parser.parseValue(`calc(${value})`);
  if (!("values" in token)) throw new Error("Missing calc fixture");
  return evaluateColorCalculation(token.values, [10, 20, 30, 0.5]);
};

describe("relative color calculations", () => {
  it.each([
    ["r + r + g * 2", 60],
    ["(r + g) * 2", 60],
    ["calc(r + calc(g * 2)) / 5", 10],
    ["b - g - r", 0],
    ["b / 2 / 3", 5],
    ["-2 * x + y", 0],
    ["-(r + g) + z", 0],
    ["+ r", 10],
    ["alpha * 2", 1],
    ["1e2 + 0.5", 100.5],
  ])("evaluates %s", (input, result) => {
    expect(calculate(input)).toBe(result);
  });

  it.each([
    "",
    "r +",
    "r g",
    "r, g",
    "unknown",
    "constructor",
    "min(r, g)",
    "r ** 2",
    "r % 2",
    "1px",
    "50%",
    "r / 0",
    "0 / 0",
    "1e999",
    "1e308 * 1e308",
    "r = 1",
  ])("rejects non-numeric or invalid syntax: %s", (input) => {
    expect(() => calculate(input)).toThrow();
  });

  it("rejects deeply nested calculations", () => {
    expect(() =>
      calculate("calc(".repeat(70) + "r" + ")".repeat(70))
    ).toThrow();
  });

  it("rejects escaped CSS identifiers without executing them", () => {
    const marker = jest.fn();
    Object.defineProperty(globalThis, "cssPoC", {
      value: marker,
      configurable: true,
    });
    const escaped = Array.from("cssPoC()")
      .map((character) => `\\${character.charCodeAt(0).toString(16)} `)
      .join("");
    try {
      expect(() =>
        color.parse(
          {} as Context,
          Parser.parseValue(`color(from red srgb calc(${escaped}) g b)`)
        )
      ).toThrow();
      expect(marker).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(globalThis, "cssPoC");
    }
  });

  it("does not map unknown channel identifiers to blue", () => {
    expect(() =>
      color.parse(
        {} as Context,
        Parser.parseValue("color(from red srgb unknown g b)")
      )
    ).toThrow();
  });
});

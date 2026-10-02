import { combineLines, TextBounds } from "../../../src/css/layout/text";
import { Bounds } from "../../../src/css/layout/bounds";

describe("Browser line breaks in PDF text", () => {
  it("keeps separate lines when Inter glyph bounds exceed CSS line-height", () => {
    const words = [
      new TextBounds(
        "Eksempel Kunde med navn",
        new Bounds(66, 149.296875, 148.875, 19)
      ),
      new TextBounds("så bra", new Bounds(66, 167.296875, 44.453125, 19)),
    ];
    expect(combineLines(words).map((line) => line.text)).toEqual([
      "Eksempel Kunde med navn",
      "så bra",
    ]);
    expect(combineLines(words).map((line) => line.bounds.top)).toEqual([
      149.296875, 167.296875,
    ]);
  });

  it("does not chain three overlapping sender lines into one", () => {
    const lines = ["Kontaktperson med navn", "venter på", "Eksempelavdeling"];
    expect(
      combineLines(
        lines.map(
          (text, i) =>
            new TextBounds(
              text,
              new Bounds(576.984375, 149.296875 + i * 18, 140, 19)
            )
        )
      ).map((line) => line.text)
    ).toEqual(lines);
  });

  it("still combines adjacent fragments on the same browser line", () => {
    const result = combineLines([
      new TextBounds("Eksempel ", new Bounds(66, 149.296875, 55, 19)),
      new TextBounds("Kunde", new Bounds(121, 149.296875, 35, 19)),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Eksempel Kunde");
    expect(result[0].bounds).toEqual(new Bounds(66, 149.296875, 90, 19));
  });
});

import { CanvasKit } from "@html2pdf-skia/canvaskit-pdf";
import { SkiaFontCollection } from "../../../src/fonts/font-collection";

function collection(): SkiaFontCollection {
  const kit = {
    TypefaceFontProvider: { Make: () => ({ registerFont: jest.fn() }) },
    Font: class {},
  } as unknown as CanvasKit;
  return new SkiaFontCollection(kit);
}

describe("Source fonts for hidden captions", () => {
  it("resolves generic families through configured defaults and selects the weight", () => {
    const fonts = collection();
    const regular = new ArrayBuffer(1);
    const semibold = new ArrayBuffer(2);
    fonts.addFont(regular, "Fixture Sans", { fontWeight: 400 });
    fonts.addFont(semibold, "Fixture Sans", { fontWeight: 600 });
    fonts.setDefaultFonts("sans-serif", ["Fixture Sans"]);
    expect(fonts.getFontData(["missing", "sans-serif"], 600)).toBe(semibold);
    expect(fonts.getFontData(["SANS-SERIF"], 400)).toBe(regular);
  });

  it("tries explicit families before generic fallbacks, as visible text does", () => {
    const fonts = collection();
    const fallback = new ArrayBuffer(1);
    const explicit = new ArrayBuffer(2);
    fonts.addFont(fallback, "Default Font");
    fonts.addFont(explicit, "Explicit Font");
    fonts.setDefaultFonts("sans-serif", ["Default Font"]);
    expect(fonts.getFontData(["sans-serif", "explicit font"], 400)).toBe(
      explicit
    );
  });

  it("does not choose an unrelated font when a family has no mapping", () => {
    const fonts = collection();
    fonts.addFont(new ArrayBuffer(1), "Unrelated Font");
    expect(fonts.getFontData(["serif"], 400)).toBeUndefined();
  });
});

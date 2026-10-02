import { HtmlPageBreak } from "../../../src/pdf/html-page-break";
import { FontMetrics } from "../../../src/render/font-metrics";

describe("PDF page layout", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("exports existing full-height no-break sheets without an extra bottom margin", () => {
    document.body.innerHTML =
      '<article class="pdf-sheet no-break"></article><article class="pdf-sheet no-break"></article>';
    const sheets = Array.from(document.querySelectorAll("article"));
    sheets.forEach((sheet) => {
      sheet.getBoundingClientRect = () => {
        const top =
          sheets
            .filter(
              (previous) =>
                !previous.classList.contains("hide-previous-page-item")
            )
            .indexOf(sheet) * 1122;
        return {
          left: 0,
          right: 793.3333333333334,
          top,
          bottom: top + 1122,
          width: 793.3333333333334,
          height: 1122,
          x: 0,
          y: top,
          toJSON: () => ({}),
        };
      };
    });
    const pagination = new HtmlPageBreak(document, 842 / 0.75);
    expect(pagination.processPage()).toBe(document.body);
    expect(sheets[0].classList.contains("hide-next-page-item")).toBe(false);
    expect(sheets[1].classList.contains("hide-next-page-item")).toBe(true);
    pagination.postProcess();
    expect(pagination.processPage()).toBe(document.body);
    pagination.postProcess();
    expect(pagination.processPage()).toBeNull();
  });

  it("measures the requested numeric font size as CSS pixels", () => {
    const append = jest.spyOn(document.body, "appendChild");
    new FontMetrics(document).getMetrics("Inter", "30");
    const measurement = append.mock.calls[0][0] as HTMLElement;
    expect(measurement.style.fontSize).toBe("30px");
    append.mockRestore();
  });
});

import { describe, expect, it } from "vitest";
import { inChristmasWindow, resolveSeason } from "@/lib/seasonal";

describe("tema de Natal", () => {
  it("janela automática: 15/nov a 6/jan", () => {
    expect(inChristmasWindow("2026-11-14")).toBe(false);
    expect(inChristmasWindow("2026-11-15")).toBe(true);
    expect(inChristmasWindow("2026-12-01")).toBe(true);
    expect(inChristmasWindow("2026-12-31")).toBe(true);
    expect(inChristmasWindow("2027-01-06")).toBe(true);
    expect(inChristmasWindow("2027-01-07")).toBe(false);
    expect(inChristmasWindow("2027-07-15")).toBe(false);
  });

  it("variável: natal/on força, off desliga, auto (ou vazia) segue a data", () => {
    expect(resolveSeason({ today: "2026-11-10", setting: "natal" })).toBe("natal");
    expect(resolveSeason({ today: "2026-11-10", setting: "ON" })).toBe("natal");
    expect(resolveSeason({ today: "2026-12-20", setting: "off" })).toBeNull();
    expect(resolveSeason({ today: "2026-12-20", setting: "auto" })).toBe("natal");
    expect(resolveSeason({ today: "2026-12-20" })).toBe("natal");
    expect(resolveSeason({ today: "2026-11-10" })).toBeNull();
    expect(resolveSeason({ today: "2026-11-18" })).toBe("natal");
  });

  it("?tema= na URL vale só para a visita e manda em tudo", () => {
    expect(resolveSeason({ today: "2026-11-10", setting: "off", urlParam: "natal" })).toBe("natal");
    expect(resolveSeason({ today: "2026-12-20", setting: "natal", urlParam: "padrao" })).toBeNull();
    expect(resolveSeason({ today: "2026-12-20", urlParam: "qualquer" })).toBe("natal"); // valor desconhecido: ignora
  });
});

import { describe, expect, it } from "vite-plus/test";

import { translationCatalogs } from "./i18n";

describe("game positioning copy", () => {
  it("names all three persisted audio sources in every locale", () => {
    for (const catalog of Object.values(translationCatalogs)) {
      expect(catalog["settings.audio"]).not.toBe("");
      expect(catalog["settings.masterVolume"]).not.toBe("");
      expect(catalog["settings.musicVolume"]).not.toBe("");
      expect(catalog["settings.sfxVolume"]).not.toBe("");
    }
  });

  it("describes TUMBLEDRUM as a performance brick-breaker Canvas arcade", () => {
    expect(translationCatalogs.en["game.tumbledrum.type"]).toBe(
      "Performance brick-breaker / Canvas arcade",
    );
    expect(translationCatalogs["zh-Hans"]["game.tumbledrum.type"]).toBe(
      "表演型打砖块 / Canvas 街机",
    );
    expect(translationCatalogs.ja["game.tumbledrum.type"]).toContain("ブロック崩し");
  });

  it("describes PulseLinkOverdrive as a competitive dual-board color connection puzzle", () => {
    expect(translationCatalogs.en["game.pulse.type"]).toBe(
      "Competitive dual-board drop puzzle / color connection",
    );
    expect(translationCatalogs["zh-Hans"]["game.pulse.type"]).toBe("双棋盘竞争式落块 / 颜色连接");
    expect(translationCatalogs.ja["game.pulse.type"]).toContain("デュアルボード");
    expect(
      [
        translationCatalogs.en["game.pulse.type"],
        translationCatalogs.en["game.pulse.description"],
      ].join(" "),
    ).not.toMatch(/card/i);
  });
});

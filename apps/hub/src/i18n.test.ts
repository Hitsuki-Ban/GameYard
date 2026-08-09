import { describe, expect, it } from "vite-plus/test";

import { translationCatalogs } from "./i18n";

describe("Hub translation catalogs", () => {
  it("names every persisted audio source in every locale", () => {
    for (const catalog of Object.values(translationCatalogs)) {
      expect(catalog["settings.audio"]).not.toBe("");
      expect(catalog["settings.masterVolume"]).not.toBe("");
      expect(catalog["settings.musicVolume"]).not.toBe("");
      expect(catalog["settings.sfxVolume"]).not.toBe("");
    }
  });

  it("keeps collection copy count-neutral and complete in every locale", () => {
    for (const catalog of Object.values(translationCatalogs)) {
      expect(catalog["brand.subtitle"]).not.toMatch(/(?:three|3|三款|三个|3作品)/i);
      expect(catalog["index.instruction"]).not.toMatch(/(?:all three|三款|3作品)/i);
      expect(catalog["catalog.count"]).toContain("{{count}}");
      expect(catalog["stage.settingsRequired"]).not.toBe("");
    }
  });
});

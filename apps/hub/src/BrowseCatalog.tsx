import type { CSSProperties, MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { GameCatalogEntry, GameId } from "./catalog";
import { GameCover } from "./GameCover";
import { languageAutonym } from "./locales";
import { gameSearch } from "./route";
import type { SupportedLocale } from "./settings";

const EAGER_COVER_COUNT = 4;
const CATALOG_COVER_SIZES =
  "(max-width: 560px) calc(100vw - 32px), (max-width: 980px) calc(50vw - 40px), (max-width: 1480px) calc(25vw - 32px), 360px";

type CatalogCardStyle = CSSProperties & { readonly "--game-accent": string };

interface BrowseCatalogProps {
  readonly games: readonly GameCatalogEntry[];
  readonly locale: SupportedLocale;
  readonly onSelect: (gameId: GameId) => void;
}

export function catalogCoverPolicy(index: number): {
  readonly fetchPriority: "auto" | "high";
  readonly loading: "eager" | "lazy";
} {
  return {
    loading: index < EAGER_COVER_COUNT ? "eager" : "lazy",
    fetchPriority: index === 0 ? "high" : "auto",
  };
}

export function BrowseCatalog({ games, locale, onSelect }: BrowseCatalogProps) {
  const { t } = useTranslation();

  return (
    <ol className="catalog-grid">
      {games.map((game, index) => (
        <li
          className="catalog-card"
          key={game.id}
          style={{ "--game-accent": game.accent } as CatalogCardStyle}
        >
          <a
            className="catalog-card__link"
            href={gameSearch(game.id)}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              event.preventDefault();
              onSelect(game.id);
            }}
          >
            <GameCover
              className="catalog-card__cover"
              game={game}
              {...catalogCoverPolicy(index)}
              sizes={CATALOG_COVER_SIZES}
            />
            <span className="catalog-card__body">
              <span className="catalog-card__languages">
                {t("catalog.languages")}:{" "}
                {game.languages.map((language, languageIndex) => (
                  <span key={language} lang={language}>
                    {languageIndex > 0 ? " · " : null}
                    {languageAutonym(language)}
                  </span>
                ))}
              </span>
              <span className="catalog-card__title">{game.title}</span>
              <span className="catalog-card__tagline">{game.taglines[locale]}</span>
              <span className="catalog-card__action">
                {t("catalog.start")} <span aria-hidden="true">↗</span>
              </span>
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}

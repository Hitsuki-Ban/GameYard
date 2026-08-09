import type { GameCatalogEntry } from "./catalog";

interface GameCoverProps {
  readonly className: string;
  readonly fetchPriority: "auto" | "high" | "low";
  readonly game: GameCatalogEntry;
  readonly loading: "eager" | "lazy";
  readonly sizes: string;
}

export function GameCover({ className, fetchPriority, game, loading, sizes }: GameCoverProps) {
  const fallback = game.cover.candidates.at(-1);
  if (!fallback) throw new Error(`Catalog game ${game.id} is missing a cover candidate`);
  const srcSet = game.cover.candidates
    .map((candidate) => `${candidate.url} ${candidate.width}w`)
    .join(", ");

  return (
    <picture className={className} aria-hidden="true">
      <img
        src={fallback.url}
        srcSet={srcSet}
        sizes={sizes}
        width={fallback.width}
        height={fallback.height}
        loading={loading}
        fetchPriority={fetchPriority}
        alt=""
      />
    </picture>
  );
}

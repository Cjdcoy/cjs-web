import { useCallback, useMemo } from "react";
import type { Player, Source } from "../../lib/api";
import { selectPlayerFavorites, togglePlayerFavorite, useFavorites } from "../../lib/storage";

export function useFavoritePlayers(source: Source) {
  const favoriteDocument = useFavorites();

  const favoriteIds = useMemo(() => {
    return new Set(
      selectPlayerFavorites(favoriteDocument)
        .filter((favorite) => favorite.source === source)
        .map((favorite) => favorite.id),
    );
  }, [favoriteDocument, source]);

  const toggleFavorite = useCallback(
    (player: Player) => {
      togglePlayerFavorite(player, source);
    },
    [source],
  );

  return { favoriteIds, toggleFavorite };
}

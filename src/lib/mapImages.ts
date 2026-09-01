export interface MapImageSources {
  readonly card: string;
  readonly thumbnail: string;
  readonly srcSet: string;
}

export function getMapImageSources(mapName: string): MapImageSources {
  const key = encodeURIComponent(mapName);
  const thumbnail = `/maps/thumbs/${key}.avif`;
  const card = `/maps/cards/${key}.avif`;

  return {
    card,
    thumbnail,
    srcSet: `${thumbnail} 480w, ${card} 960w`,
  };
}

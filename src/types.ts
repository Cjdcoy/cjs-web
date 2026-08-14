export type Source = "jh" | "j4l";

export interface ServerPlayer {
  playername: string;
  playerid: number;
  ping: number;
  admin: number;
}

export interface GameServer {
  domain: string;
  ip: string;
  port: number;
  map: string;
  mapid: number;
  game_type: string;
  players: ServerPlayer[] | null;
  player_count: number;
  online: boolean;
}

export interface ServerResponse {
  servers: GameServer[];
  total_players: number;
  online_servers: number;
}

export interface DifficultyData {
  difficulty: number;
  nb_tops: number;
}

export interface GameMap {
  mapid: number;
  mapname: string;
  cp_id: number;
  ender?: number | null;
  author?: string | null;
  released?: string | null;
  type?: string | null;
  difficulty?: Record<string, DifficultyData> | null;
  individual_finish_count?: number;
  video?: string | null;
}

export interface Player {
  player_id: number;
  playername: string;
  pref_name?: string;
  last_seen?: string;
  banned?: number;
  admin?: number;
  admin_speedrun?: number;
  admin_emelie?: number;
  xp?: number;
  xp_speedrun?: number;
  visits?: number;
  donated?: number;
  country?: string;
}

export interface LeaderboardEntry {
  player_id: number;
  player_name?: string;
  playername?: string;
  rank?: number;
  rating?: number;
  score?: number;
  points?: number;
  xp?: number;
  country?: string;
  country_code?: string;
  region?: string;
  last_seen?: string;
  top_list?: Record<string, number>;
  [key: string]: unknown;
}

export interface TopRun {
  rank?: number;
  player_id?: number;
  playername?: string;
  player_name?: string;
  time?: number;
  time_played?: number;
  fps?: string;
  score?: number;
  mapname?: string;
  cpid?: number;
  totalNr?: number;
  time_played_string?: string;
  load_count?: number;
  save_count?: number;
  time_created?: string;
}

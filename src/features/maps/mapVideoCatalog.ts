export interface MapVideoCatalogEntry {
  label: string;
  videoId: string;
  route?: string;
  startSeconds?: number;
}

// Source-neutral map/video metadata curated from the public Open CJ Stats map catalog:
// https://cjstats.sicmundus.ovh/maps (retrieved 2026-09-02).
export const mapVideoCatalog: Readonly<Record<string, readonly MapVideoCatalogEntry[]>> = {
  "1m9055186e": [
    {
      label: "250 fps speedrun",
      videoId: "ENiscEDy1ug",
    },
  ],
  "1st_easy": [
    {
      label: "125 fps speedrun",
      videoId: "TYntstrWPOc",
    },
    {
      label: "125 fps showcase",
      videoId: "JQ_fIlnosyw",
    },
  ],
  "4dmaze": [
    {
      label: "250 fps showcase",
      videoId: "bBrcWfHvAas",
    },
  ],
  "7th_jump": [
    {
      label: "125 fps showcase",
      videoId: "263DiyaIpWM",
    },
  ],
  bitch: [
    {
      label: "125 fps no grenade",
      videoId: "vAPCuimIpig",
    },
  ],
  de_straf: [
    {
      label: "250 fps showcase",
      videoId: "S_2yZnfjbME",
    },
  ],
  defrag_portal: [
    {
      label: "125 fps showcase",
      videoId: "IIpssQdWtxc",
    },
  ],
  eplay_house: [
    {
      label: "125 fps showcase",
      videoId: "LKRLhSjuSYQ",
    },
  ],
  fun_playhouse: [
    {
      label: "125 fps showcase",
      videoId: "Ejxm_qmiLsw",
    },
  ],
  gaap: [
    {
      label: "tutorial",
      videoId: "iFjz_8dPmpA",
    },
  ],
  j4l_baseton: [
    {
      label: "125 fps touchpad showcase",
      videoId: "yq-ovrvjwDI",
    },
  ],
  j4l_raceland: [
    {
      label: "125 fps showcase",
      videoId: "YyqatvmCWhs",
    },
  ],
  j4l_real_artist: [
    {
      label: "125 fps showcase",
      videoId: "FONKNlPJea4",
    },
    {
      label: "125 fps speedrun",
      videoId: "a50eIwMGdi4",
    },
  ],
  jm_alexandria_hard: [
    {
      label: "125 fps showcase",
      videoId: "Ikm3L_1BX5E",
    },
  ],
  jm_arch: [
    {
      label: "125 fps showcase",
      videoId: "ID6-SiucX34",
    },
  ],
  jm_bhop_hell: [
    {
      label: "250 fps showcase",
      videoId: "UBvbtBS6ZQI",
    },
  ],
  jm_bhop_hell_easy: [
    {
      label: "250 fps showcase",
      videoId: "MruEPjtOYOg",
    },
  ],
  jm_bouncejump_easy: [
    {
      label: "125 fps showcase",
      videoId: "4RP-vIJ7N1c",
    },
  ],
  jm_bouncejump_hard: [
    {
      label: "125 fps showcase",
      videoId: "3KCprdHm4Vs",
    },
  ],
  jm_canyon: [
    {
      label: "125 fps speedrun",
      videoId: "HA31Dfano50",
    },
  ],
  jm_contrast: [
    {
      label: "125 fps tutorial",
      videoId: "0irPVp7mPKE",
    },
  ],
  jm_contrast_pro: [
    {
      label: "125 fps showcase",
      videoId: "PZCjbTDAVSY",
    },
    {
      label: "250 fps speedrun",
      videoId: "DjLzkRQlnIw",
    },
  ],
  jm_cruise_hard: [
    {
      label: "125 fps showcase",
      videoId: "4ORBHw2Trxo",
    },
  ],
  jm_ddl: [
    {
      label: "125 fps showcase",
      videoId: "GPCqtKMgfF4",
      route: "Hard",
    },
  ],
  jm_descend_full: [
    {
      label: "250 fps speedrun",
      videoId: "u1_ylHPbHCc",
    },
  ],
  jm_dunnoifposs: [
    {
      label: "250 fps speedrun",
      videoId: "Ew1b82wSPVs",
    },
  ],
  jm_flee: [
    {
      label: "125 fps showcase",
      videoId: "v7j3MX5Cgmk",
    },
  ],
  jm_fracture: [
    {
      label: "125 fps showcase",
      videoId: "7mK_3V8ZpFo",
    },
    {
      label: "250 fps speedrun",
      videoId: "J_iwd6sYloM",
    },
  ],
  jm_g1ng3r: [
    {
      label: "250 fps showcase",
      videoId: "cIZ_ldYVsho",
    },
  ],
  jm_gardenv2: [
    {
      label: "125 fps showcase",
      videoId: "ASpVGFGV-p0",
    },
  ],
  jm_glass: [
    {
      label: "125 fps speedrun",
      videoId: "qfNMnlbFTFM",
    },
    {
      label: "125 fps showcase",
      videoId: "XhZqNmZ4VyU",
    },
  ],
  jm_glass_hard: [
    {
      label: "125 fps showcase",
      videoId: "RenM2-h6Xnk",
    },
  ],
  jm_glassy: [
    {
      label: "125 fps showcase",
      videoId: "yIj2vTlPjXY",
    },
  ],
  jm_heaven_and_hell: [
    {
      label: "125 fps showcase",
      videoId: "RB2PekDC5vg",
      route: "Hell",
    },
  ],
  jm_hellrun_hard: [
    {
      label: "125 fps speedrun",
      videoId: "MvWbuDB66OA",
    },
    {
      label: "250 fps speedrun",
      videoId: "ihok1BWQ3r8",
    },
  ],
  jm_jumpers_heaven: [
    {
      label: "125 fps showcase",
      videoId: "KjUJeM8qDLQ",
    },
  ],
  jm_jumpers_heaven_hard: [
    {
      label: "125 fps showcase",
      videoId: "-PTeYyyPYOs",
    },
  ],
  jm_kuwehr: [
    {
      label: "125 fps showcase",
      videoId: "mWUBTSWLxSw",
    },
  ],
  jm_kuwehr2: [
    {
      label: "125 fps showcase",
      videoId: "smNxrcv-wgY",
    },
  ],
  jm_legomania: [
    {
      label: "125 fps showcase",
      videoId: "yAd044053Gg",
    },
  ],
  jm_lighthouse_hard: [
    {
      label: "125 fps showcase",
      videoId: "H4fq21gyKqc",
    },
    {
      label: "125 fps speedrun",
      videoId: "td2krbuvL-4",
    },
  ],
  jm_lost: [
    {
      label: "125 no grenade",
      videoId: "_0TBcTwX-cY",
    },
  ],
  jm_lost_easy: [
    {
      label: "125 fps speedrun",
      videoId: "aRLB2Z0Bm7o",
    },
  ],
  jm_lostinice: [
    {
      label: "trailer",
      videoId: "qtGeSWM3Tig",
    },
  ],
  jm_memento: [
    {
      label: "125 fps showcase",
      videoId: "WRoX-4NZ4f8",
    },
    {
      label: "trailer",
      videoId: "30TLrfSp224",
    },
  ],
  jm_nostop: [
    {
      label: "250 fps showcase",
      videoId: "dW2_bsvyFRY",
      route: "Hard",
    },
  ],
  jm_offices_hard: [
    {
      label: "125 fps showcase",
      videoId: "CbeS3z7bxUc",
    },
  ],
  jm_phil: [
    {
      label: "125 fps showcase",
      videoId: "8RCGO-UwGxo",
      route: "Easy",
    },
    {
      label: "250 fps speedrun",
      videoId: "3IH8R_6yUJU",
      route: "Extreme",
    },
  ],
  jm_pier_2: [
    {
      label: "125 fps showcase",
      videoId: "yK0am1Jw4No",
    },
    {
      label: "trailer",
      videoId: "mfr6bAhwxEI",
    },
  ],
  jm_pier_2_pro: [
    {
      label: "125 fps speedrun",
      videoId: "bLkBgo0s1n4",
    },
    {
      label: "125 fps speedrun",
      videoId: "Za7UPVl9wr4",
    },
    {
      label: "250 fps speedrun",
      videoId: "13p_C7RIN0M",
    },
  ],
  jm_pier_250: [
    {
      label: "250 fps showcase",
      videoId: "wgdaAjjG8AU",
    },
  ],
  jm_pier_pro: [
    {
      label: "125 fps showcase",
      videoId: "X9cGJEVShAI",
    },
  ],
  jm_plazma: [
    {
      label: "125 fps no grenade",
      videoId: "zarAXwxsylE",
      route: "Hard",
    },
    {
      label: "125 fps no grenade",
      videoId: "qZzB5uCZk9w",
    },
  ],
  jm_portal2: [
    {
      label: "125 fps showcase",
      videoId: "mDgxYRvyzO0",
    },
  ],
  jm_prestige: [
    {
      label: "125 fps showcase",
      videoId: "7w0iisRKIQM",
    },
  ],
  jm_qubed: [
    {
      label: "125 fps no nade",
      videoId: "hwKABJLogog",
    },
  ],
  jm_race_easy: [
    {
      label: "125 fps showcase",
      videoId: "J7DwVZj03gQ",
    },
  ],
  jm_rats: [
    {
      label: "250 fps showcase",
      videoId: "JV8nSUvxuig",
    },
  ],
  jm_renaissance: [
    {
      label: "333 fps no grenades short",
      videoId: "2Mh-rS56Ll4",
    },
    {
      label: "125 fps no grenades short",
      videoId: "Ym_ugKMnO6c",
    },
  ],
  jm_renaissance_hard: [
    {
      label: "125 fps speedrun",
      videoId: "F65KrLc6ylo",
    },
  ],
  jm_residual: [
    {
      label: "125 fps showcase",
      videoId: "qrldbVYi2zA",
    },
  ],
  jm_snowland: [
    {
      label: "250 fps showcase",
      videoId: "yWn4Dr99bzw",
    },
    {
      label: "125 fps showcase",
      videoId: "p9hDtNucBCg",
    },
  ],
  jm_ssirhc_easy: [
    {
      label: "125 fps showcase",
      videoId: "7IKyVgu0rbs",
    },
  ],
  jm_state: [
    {
      label: "125 fps showcase",
      videoId: "2dGieWuy3NA",
    },
  ],
  jm_strange_ways: [
    {
      label: "125 fps showcase",
      videoId: "hkgflw_vtr8",
    },
  ],
  jm_switchjump: [
    {
      label: "125 fps speedrun",
      videoId: "WkHO6XWi6hQ",
    },
  ],
  jm_tower_of_hate: [
    {
      label: "125 fps speedrun",
      videoId: "1z1AeiQSQxI",
    },
  ],
  jm_tower_of_hates: [
    {
      label: "125 fps speedrun",
      videoId: "1z1AeiQSQxI",
      startSeconds: 43,
    },
  ],
  jm_warmup: [
    {
      label: "125 fps speedrun",
      videoId: "Sn2Yn2BVlNQ",
      route: "Easy",
    },
    {
      label: "125 fps speedrun",
      videoId: "Sn2Yn2BVlNQ",
      route: "Inter",
      startSeconds: 45,
    },
    {
      label: "125 fps speedrun",
      videoId: "Sn2Yn2BVlNQ",
      route: "Hard",
      startSeconds: 105,
    },
    {
      label: "125 fps speedrun",
      videoId: "Sn2Yn2BVlNQ",
      route: "Extreme",
      startSeconds: 214,
    },
    {
      label: "250 fps speedrun",
      videoId: "Sn2Yn2BVlNQ",
      route: "250",
      startSeconds: 351,
    },
  ],
  kanyewest: [
    {
      label: "trailer",
      videoId: "A1EVxhA6P2c",
    },
  ],
  like_a_g6: [
    {
      label: "333 fps speedrun",
      videoId: "fK72wZamBUM",
    },
  ],
  macitest2: [
    {
      label: "250 fps no grenades",
      videoId: "Tjqj1EzTdIs",
    },
    {
      label: "125 fps speedrun",
      videoId: "0e32aU0W_I4",
    },
  ],
  mp_12: [
    {
      label: "125 fps showcase",
      videoId: "QUfgmYZjV6o",
    },
  ],
  mp_3dmazekruskalbig: [
    {
      label: "250 fps showcase",
      videoId: "zJA4t397uLw",
    },
  ],
  mp_6jump_hard: [
    {
      label: "125 fps speedrun",
      videoId: "6mraVTH5iTI",
    },
  ],
  mp_blowed_easy: [
    {
      label: "125 fps showcase",
      videoId: "jiT6jp8MdLk",
    },
  ],
  mp_cards: [
    {
      label: "250 fps speedrun",
      videoId: "uDFVFTtAUs4",
      route: "Easy",
    },
    {
      label: "250 fps speedrun",
      videoId: "uDFVFTtAUs4",
      route: "Hard",
      startSeconds: 292,
    },
    {
      label: "250 fps speedrun",
      videoId: "uDFVFTtAUs4",
      route: "Insane",
      startSeconds: 462,
    },
  ],
  mp_carentan: [
    {
      label: "125 fps no save",
      videoId: "wcPG_HoftEk",
      route: "classic",
    },
  ],
  mp_chilli: [
    {
      label: "125 fps showcase",
      videoId: "_EOjiEGgqGE",
    },
    {
      label: "250 fps speedrun",
      videoId: "_cH-JyqFdRM",
    },
  ],
  mp_colors: [
    {
      label: "125 fps speedrun",
      videoId: "gtobkYbf-Ec",
    },
  ],
  "mp_d-cow_v2_hard": [
    {
      label: "250 fps speedrun",
      videoId: "ZA2Xq8Xr5_U",
    },
  ],
  "mp_d-jump": [
    {
      label: "125 fps showcase",
      videoId: "fYNtdQEeTMU",
    },
  ],
  mp_dark_portal_250: [
    {
      label: "250 fps showcase",
      videoId: "dZ19UWD6FX8",
    },
  ],
  mp_daskorun: [
    {
      label: "125 fps speedrun",
      videoId: "7LICcI_Up3I",
    },
  ],
  mp_fastend: [
    {
      label: "125 fps showcase",
      videoId: "KZ7k0uSD00o",
    },
  ],
  mp_free_fall: [
    {
      label: "125 fps showcase",
      videoId: "lisaFWKrwYQ",
    },
  ],
  mp_highgrass: [
    {
      label: "125 fps showcase",
      videoId: "rE_i4rVnp4c",
    },
  ],
  mp_jump: [
    {
      label: "125 fps showcase",
      videoId: "Vnep0VBIRDs",
    },
  ],
  mp_jump_arena: [
    {
      label: "125 fps showcase",
      videoId: "kf6BUuxcNMw",
    },
  ],
  mp_jump_hard: [
    {
      label: "250 fps speedrun",
      videoId: "kvOL96Ju4F4",
    },
  ],
  mp_mega: [
    {
      label: "125 fps showcase",
      videoId: "IJzE1nPek84",
    },
    {
      label: "250 fps no grenades short",
      videoId: "W6QIh-zDwTo",
    },
  ],
  "mp_ontherocks_v1.0": [
    {
      label: "125 fps fps no grenade",
      videoId: "qkJYjLpaoeA",
    },
  ],
  mp_paprika: [
    {
      label: "125 fps showcase",
      videoId: "S-FzIg2wVZw",
    },
  ],
  mp_paskvil: [
    {
      label: "125 fps showcase",
      videoId: "_8EZV5P05U0",
    },
  ],
  mp_paskvil_easy: [
    {
      label: "125 fps showcase",
      videoId: "v8rhtJa3Nh4",
    },
    {
      label: "125 fps showcase",
      videoId: "p2kWnrkG0xc",
    },
    {
      label: "250 fps speedrun",
      videoId: "9c2FxgOQNdM",
    },
  ],
  mp_prisonbreak: [
    {
      label: "125 fps showcase",
      videoId: "x3h04lggHyU",
    },
  ],
  mp_pyramid: [
    {
      label: "125 fps showcase",
      videoId: "DgEr69y0ZhA",
    },
  ],
  mp_scjump: [
    {
      label: "125 fps showcase",
      videoId: "BXCZFykGO7g",
    },
  ],
  mp_sht_ladder_hard: [
    {
      label: "250 fps showcase",
      videoId: "3fSJ0N1mv4U",
    },
  ],
  mp_simplewicked_full: [
    {
      label: "125 fps speedrun",
      videoId: "DNR_VtM1gE8",
    },
  ],
  mp_space_250: [
    {
      label: "250 fps showcase",
      videoId: "vuBFiwcArcE",
    },
  ],
  mp_special: [
    {
      label: "250 fps speedrun",
      videoId: "Vq7LtDgk9bA",
    },
  ],
  mp_toilet: [
    {
      label: "125 fps showcase",
      videoId: "3ctWJkCKsG4",
    },
  ],
  mp_unique: [
    {
      label: "125 fps showcase",
      videoId: "fVZX4A7xy_M",
    },
  ],
  mp_yka: [
    {
      label: "250 fps speedrun",
      videoId: "uoVDG01lPn4",
    },
  ],
  railyard_jump_hard: [
    {
      label: "125 fps showcase",
      videoId: "EYXacNGhwwI",
    },
  ],
  railyard_jump_light: [
    {
      label: "125 fps showcase",
      videoId: "V9ytP13z1vU",
    },
  ],
  railyard_jump_ultra_250: [
    {
      label: "250 fps no grenades",
      videoId: "OaQoWxfomZY",
    },
  ],
  sc_telijump: [
    {
      label: "125 fps showcase",
      videoId: "_m14YuaUgng",
    },
  ],
  sp_eldaba: [
    {
      label: "250 fps showcase part 1",
      videoId: "p3aTRSzMnB8",
      route: "Easy",
    },
    {
      label: "250 fps showcase part 2",
      videoId: "dh2G7VozsNY",
      route: "Easy",
    },
  ],
  sp_tankhunt: [
    {
      label: "mix fps low grenades",
      videoId: "Bvav5gdntow",
    },
  ],
  sp_toujane: [
    {
      label: "mix fps showcase",
      videoId: "C4wJrDoo5r4",
    },
  ],
  svt_stronghold_easy: [
    {
      label: "125 fps showcase",
      videoId: "cyrWXiRkjWs",
    },
  ],
  uj_reznin_hard: [
    {
      label: "125 fps speedrun",
      videoId: "wubspOlK5AY",
    },
  ],
  ultra_gap_training: [
    {
      label: "125 tutorial",
      videoId: "Hk52T2-ASoY",
      route: "251",
    },
    {
      label: "125 fps no grenades",
      videoId: "myeGvLWFrKI",
      route: "251",
    },
  ],
};

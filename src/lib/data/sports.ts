/** Static competition/team catalogue used to build the sportsbook fixture list. */

export type SportDef = { key: string; name: string; icon: string; scoring: "goals" | "points" | "sets" | "runs" };

export const SPORTS: SportDef[] = [
  { key: "football", name: "Football", icon: "⚽", scoring: "goals" },
  { key: "basketball", name: "Basketball", icon: "🏀", scoring: "points" },
  { key: "tennis", name: "Tennis", icon: "🎾", scoring: "sets" },
  { key: "cricket", name: "Cricket", icon: "🏏", scoring: "runs" },
  { key: "rugby", name: "Rugby", icon: "🏉", scoring: "points" },
  { key: "esports", name: "E-Sports", icon: "🎮", scoring: "points" },
  { key: "boxing", name: "Boxing", icon: "🥊", scoring: "points" },
  { key: "hockey", name: "Ice Hockey", icon: "🏒", scoring: "goals" },
  { key: "baseball", name: "Baseball", icon: "⚾", scoring: "runs" },
  { key: "volleyball", name: "Volleyball", icon: "🏐", scoring: "sets" },
];

export const SPORT_MAP = Object.fromEntries(SPORTS.map((s) => [s.key, s]));

export type League = { sport: string; name: string; country: string; teams: string[] };

export const LEAGUES: League[] = [
  { sport: "football", name: "Premier League", country: "England", teams: ["Manchester City", "Arsenal", "Liverpool", "Chelsea", "Tottenham", "Manchester United", "Newcastle", "Aston Villa", "Brighton", "West Ham", "Everton", "Fulham"] },
  { sport: "football", name: "LaLiga", country: "Spain", teams: ["Real Madrid", "Barcelona", "Atletico Madrid", "Sevilla", "Real Sociedad", "Villarreal", "Valencia", "Real Betis", "Athletic Club", "Girona"] },
  { sport: "football", name: "Serie A", country: "Italy", teams: ["Inter Milan", "Juventus", "AC Milan", "Napoli", "AS Roma", "Lazio", "Atalanta", "Fiorentina", "Bologna", "Torino"] },
  { sport: "football", name: "Bundesliga", country: "Germany", teams: ["Bayern Munich", "Bayer Leverkusen", "Borussia Dortmund", "RB Leipzig", "Eintracht Frankfurt", "Wolfsburg", "Stuttgart", "Hoffenheim"] },
  { sport: "football", name: "Ligue 1", country: "France", teams: ["Paris Saint-Germain", "Monaco", "Marseille", "Lille", "Lyon", "Nice", "Rennes", "Lens"] },
  { sport: "football", name: "Kenyan Premier League", country: "Kenya", teams: ["Gor Mahia", "AFC Leopards", "Tusker FC", "Bandari FC", "KCB FC", "Ulinzi Stars", "Kakamega Homeboyz", "Sofapaka", "Bidco United", "Nairobi City Stars"] },
  { sport: "football", name: "UEFA Champions League", country: "Europe", teams: ["Real Madrid", "Manchester City", "Bayern Munich", "Barcelona", "Inter Milan", "Paris Saint-Germain", "Arsenal", "Borussia Dortmund", "Atletico Madrid", "Liverpool"] },
  { sport: "football", name: "CAF Champions League", country: "Africa", teams: ["Al Ahly", "Wydad AC", "Mamelodi Sundowns", "TP Mazembe", "Esperance", "Simba SC", "Young Africans", "Al Hilal"] },
  { sport: "football", name: "English Championship", country: "England", teams: ["Leeds United", "Leicester City", "Southampton", "Norwich City", "Watford", "Sunderland", "Coventry City", "Ipswich Town"] },
  { sport: "basketball", name: "NBA", country: "USA", teams: ["LA Lakers", "Boston Celtics", "Golden State Warriors", "Miami Heat", "Denver Nuggets", "Phoenix Suns", "Milwaukee Bucks", "Dallas Mavericks", "New York Knicks", "Philadelphia 76ers"] },
  { sport: "basketball", name: "EuroLeague", country: "Europe", teams: ["Real Madrid", "Barcelona", "Olympiacos", "Panathinaikos", "Fenerbahce", "Anadolu Efes", "CSKA Moscow", "Bayern Munich"] },
  { sport: "tennis", name: "ATP Tour", country: "International", teams: ["Novak Djokovic", "Carlos Alcaraz", "Jannik Sinner", "Daniil Medvedev", "Alexander Zverev", "Andrey Rublev", "Holger Rune", "Stefanos Tsitsipas"] },
  { sport: "tennis", name: "WTA Tour", country: "International", teams: ["Iga Swiatek", "Aryna Sabalenka", "Coco Gauff", "Elena Rybakina", "Jessica Pegula", "Marketa Vondrousova", "Ons Jabeur", "Maria Sakkari"] },
  { sport: "cricket", name: "ICC T20 Series", country: "International", teams: ["India", "Australia", "England", "South Africa", "New Zealand", "Pakistan", "Sri Lanka", "West Indies"] },
  { sport: "rugby", name: "Six Nations", country: "Europe", teams: ["Ireland", "France", "England", "Scotland", "Wales", "Italy"] },
  { sport: "esports", name: "CS2 Major", country: "International", teams: ["NAVI", "FaZe Clan", "Vitality", "G2 Esports", "Team Spirit", "MOUZ", "Heroic", "Cloud9"] },
  { sport: "esports", name: "League of Legends Worlds", country: "International", teams: ["T1", "Gen.G", "JD Gaming", "G2 Esports", "Fnatic", "Bilibili Gaming", "Cloud9", "Team Liquid"] },
  { sport: "boxing", name: "World Title Fights", country: "International", teams: ["Canelo Alvarez", "Tyson Fury", "Oleksandr Usyk", "Anthony Joshua", "Terence Crawford", "Errol Spence Jr", "Deontay Wilder", "Naoya Inoue"] },
  { sport: "hockey", name: "NHL", country: "USA", teams: ["Boston Bruins", "Colorado Avalanche", "Toronto Maple Leafs", "Vegas Golden Knights", "Edmonton Oilers", "New York Rangers", "Tampa Bay Lightning", "Dallas Stars"] },
  { sport: "baseball", name: "MLB", country: "USA", teams: ["New York Yankees", "LA Dodgers", "Houston Astros", "Atlanta Braves", "Boston Red Sox", "Chicago Cubs", "San Diego Padres", "Philadelphia Phillies"] },
  { sport: "volleyball", name: "FIVB Nations League", country: "International", teams: ["Brazil", "Poland", "USA", "Italy", "France", "Japan", "Serbia", "Slovenia"] },
];

/** Market templates offered per sport. */
export type MarketDef = {
  key: string;
  name: string;
  type: "moneyline" | "3way" | "totals" | "btts" | "double" | "handicap";
  lines?: number[];
  short: string;
};

export const MARKETS_BY_SPORT: Record<string, MarketDef[]> = {
  football: [
    { key: "1x2", name: "Full Time Result", type: "3way", short: "1X2" },
    { key: "dc", name: "Double Chance", type: "double", short: "DC" },
    { key: "ou", name: "Total Goals", type: "totals", lines: [1.5, 2.5, 3.5, 4.5], short: "O/U" },
    { key: "btts", name: "Both Teams To Score", type: "btts", short: "BTTS" },
    { key: "ah", name: "Asian Handicap", type: "handicap", lines: [-1.5, -0.5, 0.5, 1.5], short: "AH" },
    { key: "ht1x2", name: "Half Time Result", type: "3way", short: "HT" },
  ],
  basketball: [
    { key: "ml", name: "Match Winner", type: "moneyline", short: "1X2" },
    { key: "ou", name: "Total Points", type: "totals", lines: [198.5, 208.5, 218.5], short: "O/U" },
    { key: "ah", name: "Handicap", type: "handicap", lines: [-8.5, -4.5, 4.5, 8.5], short: "AH" },
  ],
  tennis: [
    { key: "ml", name: "Match Winner", type: "moneyline", short: "1X2" },
    { key: "ou", name: "Total Games", type: "totals", lines: [21.5, 23.5, 25.5], short: "O/U" },
  ],
  cricket: [
    { key: "ml", name: "Match Winner", type: "moneyline", short: "1X2" },
    { key: "ou", name: "Total Runs", type: "totals", lines: [315.5, 335.5, 355.5], short: "O/U" },
  ],
  rugby: [
    { key: "ml", name: "Match Winner", type: "moneyline", short: "1X2" },
    { key: "ou", name: "Total Points", type: "totals", lines: [41.5, 47.5, 53.5], short: "O/U" },
    { key: "ah", name: "Handicap", type: "handicap", lines: [-7.5, -3.5, 3.5], short: "AH" },
  ],
  esports: [
    { key: "ml", name: "Match Winner", type: "moneyline", short: "1X2" },
    { key: "ou", name: "Total Maps", type: "totals", lines: [2.5], short: "O/U" },
  ],
  boxing: [{ key: "ml", name: "Fight Winner", type: "moneyline", short: "1X2" }],
  hockey: [
    { key: "1x2", name: "Full Time Result", type: "3way", short: "1X2" },
    { key: "ou", name: "Total Goals", type: "totals", lines: [4.5, 5.5, 6.5], short: "O/U" },
  ],
  baseball: [
    { key: "ml", name: "Match Winner", type: "moneyline", short: "1X2" },
    { key: "ou", name: "Total Runs", type: "totals", lines: [7.5, 8.5, 9.5], short: "O/U" },
  ],
  volleyball: [
    { key: "ml", name: "Match Winner", type: "moneyline", short: "1X2" },
    { key: "ou", name: "Total Points", type: "totals", lines: [171.5, 181.5], short: "O/U" },
  ],
};

export function sportLabel(key: string): string {
  return SPORT_MAP[key]?.name ?? key;
}

export function sportIcon(key: string): string {
  return SPORT_MAP[key]?.icon ?? "🏆";
}

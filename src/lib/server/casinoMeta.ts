import { GAME_CATEGORIES, GAME_META, PLINKO_RISKS, SLOT_SYMBOLS } from "./casinoGames";
import { kenoPaytable } from "./casinoGames";

export { GAME_CATEGORIES, GAME_META, PLINKO_RISKS, SLOT_SYMBOLS };

export const WHEEL_SEGMENTS_PUBLIC = [
  { key: "0", mult: 0, color: "#141b2a" },
  { key: "1", mult: 1.5, color: "#2b7fff" },
  { key: "2", mult: 0, color: "#141b2a" },
  { key: "3", mult: 2, color: "#16c784" },
  { key: "4", mult: 1.5, color: "#2b7fff" },
  { key: "5", mult: 0, color: "#141b2a" },
  { key: "6", mult: 3, color: "#a855f7" },
  { key: "7", mult: 1.5, color: "#2b7fff" },
  { key: "8", mult: 0, color: "#141b2a" },
  { key: "9", mult: 2, color: "#16c784" },
  { key: "10", mult: 10, color: "#f5b301" },
  { key: "11", mult: 1.5, color: "#2b7fff" },
  { key: "12", mult: 0, color: "#141b2a" },
  { key: "13", mult: 2, color: "#16c784" },
  { key: "14", mult: 1.5, color: "#2b7fff" },
  { key: "15", mult: 0, color: "#141b2a" },
  { key: "16", mult: 5, color: "#e50539" },
  { key: "17", mult: 1.5, color: "#2b7fff" },
];

export function kenoTable() {
  return Array.from({ length: 10 }, (_, i) => ({
    picks: i + 1,
    table: Array.from({ length: i + 2 }, (_, h) => kenoPaytable(i + 1, h)),
  }));
}

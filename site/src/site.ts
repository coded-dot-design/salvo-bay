// Shared site facts (read at build time).
import pkg from "../../package.json";
export const VERSION = pkg.version;
export const REPO = "https://github.com/fizlet/salvo-bay";
export const HUB = "https://domvirus.com/";
export const FIZLET = "https://github.com/fizlet/fzlt";
export const base = (path = "") => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path}`;
// The fizlet-rooms server for online play (owner-deployed; ?rooms= overrides it).
export const ROOMS = import.meta.env.PUBLIC_ROOMS_URL || "wss://fizlet-rooms.fizlet.workers.dev";

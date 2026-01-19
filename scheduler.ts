process.env.TZ = "Asia/Manila";

import fs from "fs";
import path from "path";
import { main as runInternal } from "./run";
import { MAX_REELS } from "./config";

const TZ_PHILIPPINES = "Asia/Manila";
const COUNTER_FILE = path.join(__dirname, "daily_counters.json");

const MAX_PHOTOS = 12;

type ReelChannel = "petsPage" | "comedyPage";
type PhotoChannel = "coreMemes" | "petMemes" | "coupleMemes";
type Channel = ReelChannel | PhotoChannel;

async function postOne(channel: Channel) {
  console.log(`\n=== Starting post for ${channel} ===`);
  process.argv[2] = channel;
  await runInternal();
  console.log(`=== Finished post for ${channel} ===\n`);
}

async function safePost(channel: Channel): Promise<boolean> {
  try {
    await postOne(channel);
    return true;
  } catch (e) {
    console.error(`Post failed for ${channel}:`, e);
    return false;
  }
}

type Counters = {
  date: string;
  // reels
  petsPage: number;
  comedyPage: number;
  // photos (per-page counts)
  coreMemes: number;
  petMemes: number;
  coupleMemes: number;
};

function defaultCounters(): Counters {
  return {
    date: "",
    petsPage: 0,
    comedyPage: 0,
    coreMemes: 0,
    petMemes: 0,
    coupleMemes: 0,
  };
}

function loadCounters(): Counters {
  if (!fs.existsSync(COUNTER_FILE)) return defaultCounters();
  try {
    const parsed = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf8"));
    return { ...defaultCounters(), ...parsed } as Counters;
  } catch {
    return defaultCounters();
  }
}

function saveCounters(counters: Counters) {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters, null, 2));
}

// Reels: 6/day (every 2 hours) in 08..18 window
function isReelPostingHour(hour: number) {
  return hour >= 8 && hour <= 18 && hour % 2 === 0;
}

// Photos: 12/day (every hour) in 08..19 window
function isPhotoPostingHour(hour: number) {
  return hour >= 8 && hour <= 19;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getManilaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_PHILIPPINES,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getManilaTimestamp(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ_PHILIPPINES,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
}

function getManilaParts(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ_PHILIPPINES,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");
  return { hour, minute };
}

async function main() {
  const now = new Date();
  const manilaStamp = getManilaTimestamp(now);
  const { hour, minute } = getManilaParts(now);
  const today = getManilaDate(now);

  console.log(
    `Scheduler tick raw="${now.toString()}" iso="${now.toISOString()}" manila="${manilaStamp}" (hour=${hour}, minute=${minute})`
  );

  if (minute !== 0) {
    console.log("Not top of hour (minute != 0). Exiting without posting.");
    return;
  }

  let counters = loadCounters();

  // Reset counters based on Manila-local date
  if (counters.date !== today) {
    counters = { ...defaultCounters(), date: today };
    saveCounters(counters);
    console.log(`New Manila day detected (${today}). Counters reset.`);
  }

  // --- PHOTOS: independent hourly schedule, 12/day per page ---
  if (isPhotoPostingHour(hour)) {
    for (const ch of ["coreMemes", "petMemes", "coupleMemes"] as const) {
      if (counters[ch] >= MAX_PHOTOS) {
        console.log(`${ch} daily limit reached (${MAX_PHOTOS}). Skipping ${ch}.`);
        continue;
      }

      const ok = await safePost(ch);
      if (ok) {
        counters[ch]++;
        saveCounters(counters);
      }
    }
  } else {
    console.log(`Outside PHOTO posting hours in Manila. Skipping photos.`);
  }

  // --- REELS: separate schedule, 6/day, does NOT block photos if it fails ---
  if (!isReelPostingHour(hour)) {
    console.log(`Outside REEL posting hours in Manila. Skipping reels.`);
    return;
  }

  // petsPage reel
  if (counters.petsPage < MAX_REELS) {
    const ok = await safePost("petsPage");
    if (ok) {
      counters.petsPage++;
      saveCounters(counters);
    }
  } else {
    console.log("petsPage daily limit reached. Skipping petsPage.");
  }

  console.log("Waiting 10 minutes before posting comedyPage…");
  await sleep(10 * 60 * 1000);

  if (counters.comedyPage < MAX_REELS) {
    const ok = await safePost("comedyPage");
    if (ok) {
      counters.comedyPage++;
      saveCounters(counters);
    }
  } else {
    console.log("comedyPage daily limit reached. Skipping comedyPage.");
  }
}

main().catch((err) => console.error("Fatal:", err));

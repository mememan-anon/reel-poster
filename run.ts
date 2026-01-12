import * as fs from "node:fs";
import * as path from "node:path";
import { ReelUpload } from "./ReelUpload";
import dotenv from "dotenv";
dotenv.config();

const CONTENT_FILE = path.resolve("content.json");

type ChannelKey = "channel1" | "channel2";

type ChannelContent = {
  title: string;
  descriptions: readonly string[];
};

type ContentShape = Record<ChannelKey, ChannelContent>;

function loadContent(): ContentShape {
  if (!fs.existsSync(CONTENT_FILE)) throw new Error(`Missing content.json at ${CONTENT_FILE}`);
  const raw = fs.readFileSync(CONTENT_FILE, "utf8");
  return JSON.parse(raw) as ContentShape;
}

const content = loadContent();

const STATE_FILE = path.resolve(".state.json");
const PENDING_FILE = path.resolve(".pending-uploads.json");

type StateEntry = { descIndex: number; reelCounter: number };
type StateShape = Partial<Record<ChannelKey, StateEntry>>;

type PendingShape = Partial<Record<ChannelKey, { videoId: string; createdAt: string }>>;

function readState(): StateShape {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as StateShape;
  } catch {
    return {};
  }
}

function writeState(state: StateShape) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function readPending(): PendingShape {
  if (!fs.existsSync(PENDING_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PENDING_FILE, "utf8")) as PendingShape;
  } catch {
    return {};
  }
}

function writePending(pending: PendingShape) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

function clearPending(channelKey: ChannelKey) {
  const pending = readPending();
  delete pending[channelKey];
  writePending(pending);
}

function setPending(channelKey: ChannelKey, videoId: string) {
  const pending = readPending();
  pending[channelKey] = { videoId, createdAt: new Date().toISOString() };
  writePending(pending);
}

function pickNextDescription(channelKey: ChannelKey, descriptions: readonly string[]): string {
  if (descriptions.length === 0) throw new Error(`No descriptions configured for ${channelKey}`);

  const state = readState();
  const prev = state[channelKey] ?? { descIndex: 0, reelCounter: 1 };
  const current = prev.descIndex;

  const chosen = descriptions[current % descriptions.length];

  state[channelKey] = { ...prev, descIndex: (current + 1) % descriptions.length };
  writeState(state);

  return chosen;
}

function nextReelLabel(channelKey: ChannelKey): string {
  const state = readState();
  const prev = state[channelKey] ?? { descIndex: 0, reelCounter: 1 };
  const current = prev.reelCounter;

  state[channelKey] = { ...prev, reelCounter: current + 1 };
  writeState(state);

  const prefix = channelKey === "channel1" ? "pets" : "standup";
  return `${prefix}-reel-${String(current).padStart(3, "0")}-facebook`;
}

const CHANNELS: Record<
  ChannelKey,
  { pageId: string; accessToken: string; folder: string; content: ChannelContent }
> = {
  channel1: {
    pageId: process.env.PAGE_ID_1!,
    accessToken: process.env.PAGE_TOKEN_1!,
    folder: "/home/mememan/pets",
    content: content.channel1,
  },
  channel2: {
    pageId: process.env.PAGE_ID_2!,
    accessToken: process.env.PAGE_TOKEN_2!,
    folder: "/home/mememan/comedy-shows",
    content: content.channel2,
  },
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getNextVideo(folder: string): string | null {
  if (!fs.existsSync(folder)) return null;

  const files = fs
    .readdirSync(folder)
    .filter((f) => /\.(mp4|mov|m4v)$/i.test(f) && !f.startsWith("doneandsent_"))
    .sort();

  return files.length ? path.join(folder, files[0]) : null;
}

export async function main() {
  const channelArg = process.argv[2] as ChannelKey;

  if (!channelArg || !CHANNELS[channelArg]) {
    console.error("Invalid channel.");
    console.log("Usage:");
    console.log("  npx ts-node run.ts channel1");
    console.log("  npx ts-node run.ts channel2");
    return;
  }

  const channel = CHANNELS[channelArg];
  ensureDir(channel.folder);

  const uploader = new ReelUpload({
    accessToken: channel.accessToken,
    pageId: channel.pageId,
  });

  const pending = readPending();
  const pendingVideoId = pending[channelArg]?.videoId;
const { descriptions } = channel.content;

let description: string;
let uploadTitle: string;
let videoPath: string | null = null;

if (pendingVideoId) {
  console.log(`\n▶ Resuming pending upload for ${channelArg}`);
  console.log(`▶ Using existing video_id: ${pendingVideoId}`);

  uploader.setVideoId(pendingVideoId);

  // Do NOT advance counters on resume.
  // Keep the next description/title for the next *new* reel.
  description = pickNextDescription(channelArg, descriptions); // optional: keep, but usually you should NOT advance
  uploadTitle = nextReelLabel(channelArg); // optional: same note

  // If you want perfect resume behavior, store description/title in pending state
  // and reuse them. For now, simplest approach: do NOT advance on resume:
  // description = "(resumed upload)";
  // uploadTitle = "(resumed upload)";
} else {
  videoPath = getNextVideo(channel.folder);
  if (!videoPath) {
    console.log(`⚠️ No videos found in ${channel.folder}`);
    return;
  }

  console.log(`\n▶ Starting new upload for ${channelArg}`);
  console.log(`▶ Uploading file: ${videoPath}`);

  description = pickNextDescription(channelArg, descriptions);
  uploadTitle = nextReelLabel(channelArg);

  await uploader.initialize();
  const newVideoId = uploader.getCurrentVideoId();
  if (!newVideoId) throw new Error("Initialize succeeded but videoId missing.");

  setPending(channelArg, newVideoId);
  await uploader.uploadVideo(videoPath);
}

await uploader.waitUntilReady({ maxWaitMs: 600_000, intervalMs: 60_000 });

const result = await uploader.publishReel({ title: uploadTitle, description });

  if (result.post_id) {
    console.log(`✅ Published. post_id=${result.post_id}`);
    clearPending(channelArg);

    if (videoPath) {
      const dir = path.dirname(videoPath);
      const base = path.basename(videoPath);
      const dest = path.join(dir, `doneandsent_${base}`);
      fs.renameSync(videoPath, dest);
      console.log(`✅ Renamed to ${dest}\n`);
    }

    return;
  }

  console.warn("⚠️ Publish succeeded but no post_id. Keeping pending ID.\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

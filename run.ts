import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import { ReelUpload } from "./ReelUpload";
import { PhotoUpload } from "./photoUpload";

dotenv.config();

const CONTENT_FILE = path.resolve("content.json");
const STATE_FILE = path.resolve(".state.json");
const PENDING_FILE = path.resolve(".pending-uploads.json");


type ChannelKey = "petsPage" | "comedyPage" | "coreMemes" | "petMemes" | "coupleMemes";
type ChannelKind = "reel" | "photo";

type ChannelContent = {
  title: string;
  descriptions: readonly string[];
};

type ContentShape = Partial<Record<ChannelKey, ChannelContent>>;

function loadContent(): ContentShape {
  if (!fs.existsSync(CONTENT_FILE)) return {};
  const raw = fs.readFileSync(CONTENT_FILE, "utf8");
  return JSON.parse(raw) as ContentShape;
}

const content = loadContent();

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

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

  const prefix = channelKey === "petsPage" ? "pets" : "standup";
  return `${prefix}-reel-${String(current).padStart(3, "0")}-facebook`;
}

function getNextVideo(folder: string): string | null {
  if (!fs.existsSync(folder)) return null;

  const files = fs
    .readdirSync(folder)
    .filter((f) => /\.(mp4|mov|m4v)$/i.test(f) && !f.startsWith("doneandsent_"))
    .sort();

  return files.length ? path.join(folder, files[0]) : null;
}

function getNextPhoto(folder: string): string | null {
  if (!fs.existsSync(folder)) return null;

  const files = fs
    .readdirSync(folder)
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith("doneandsent_"))
    .sort();

  return files.length ? path.join(folder, files[0]) : null;
}

function markDone(filePath: string) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const dest = path.join(dir, `doneandsent_${base}`);
  fs.renameSync(filePath, dest);
  console.log(`✅ Renamed to ${dest}\n`);
}

const CHANNELS: Record<
  ChannelKey,
  {
    kind: ChannelKind;
    pageId: string;
    accessToken: string;
    folder: string;
    content?: ChannelContent;
  }
> = {
  // REELS
  petsPage: {
    kind: "reel",
    pageId: process.env.PAGE_ID_1!,
    accessToken: process.env.PAGE_TOKEN_1!,
    folder: "/home/mememan/pets",
    content: content.petsPage,
  },
  comedyPage: {
    kind: "reel",
    pageId: process.env.PAGE_ID_2!,
    accessToken: process.env.PAGE_TOKEN_2!,
    folder: "/home/mememan/comedy-shows",
    content: content.comedyPage,
  },
  // PHOTOS
  coreMemes: {
    kind: "photo",
    pageId: process.env.PAGE_ID_3!,
    accessToken: process.env.PAGE_TOKEN_3!,
    folder: "/home/mememan/memes/core-memes",
  },
  petMemes: {
    kind: "photo",
    pageId: process.env.PAGE_ID_4!,
    accessToken: process.env.PAGE_TOKEN_4!,
    folder: "/home/mememan/memes/animal-memes",
  },
  coupleMemes: {
    kind: "photo",
    pageId: process.env.PAGE_ID_5!,
    accessToken: process.env.PAGE_TOKEN_5!,
    folder: "/home/mememan/memes/relationship-memes",
  },
};

export async function main() {
  const channelArg = process.argv[2] as ChannelKey;

  if (!channelArg || !CHANNELS[channelArg]) {
    console.error("Invalid channel.");
    console.log("Usage:");
    console.log("  npx ts-node run.ts petsPage   # reels");
    console.log("  npx ts-node run.ts comedyPage   # reels");
    console.log("  npx ts-node run.ts coreMemes      # photos");
    console.log("  npx ts-node run.ts petMemes      # photos");
    console.log("  npx ts-node run.ts coupleMemes       # photos");
    return;
  }

  const channel = CHANNELS[channelArg];
  ensureDir(channel.folder);

  if (channel.kind === "photo") {
    const photoPath = getNextPhoto(channel.folder);
    if (!photoPath) {
      console.log(`⚠️ No photos found in ${channel.folder}`);
      return;
    }

    console.log(`\n▶ Uploading PHOTO for ${channelArg}`);
    console.log(`▶ Uploading file: ${photoPath}`);

    const uploader = new PhotoUpload({
      accessToken: channel.accessToken,
      pageId: channel.pageId,
    });

    // Always one photo at a go; no caption/description unless you pass it (we don't).
    const result = await uploader.uploadPhoto({ photoFile: photoPath, publish: true });

    if (result.post_id || result.id) {
      console.log(`✅ Photo uploaded. post_id=${result.post_id ?? "N/A"} photo_id=${result.id ?? "N/A"}`);
      markDone(photoPath);
      return;
    }

    console.warn("⚠️ Upload succeeded but no post_id/id returned. Not renaming.\n");
    return;
  }

  // REELS
  if (!channel.content) throw new Error(`Missing content for ${channelArg} in content.json`);
  const { descriptions } = channel.content;

  const uploader = new ReelUpload({
    accessToken: channel.accessToken,
    pageId: channel.pageId,
  });

  const pending = readPending();
  const pendingVideoId = pending[channelArg]?.videoId;

  let description: string;
  let uploadTitle: string;
  let videoPath: string | null = null;

  if (pendingVideoId) {
    console.log(`\n▶ Resuming pending REEL upload for ${channelArg}`);
    console.log(`▶ Using existing video_id: ${pendingVideoId}`);

    uploader.setVideoId(pendingVideoId);

    // Keep behaviour same as your file (advance description/title even on resume).
    description = pickNextDescription(channelArg, descriptions);
    uploadTitle = nextReelLabel(channelArg);
  } else {
    videoPath = getNextVideo(channel.folder);
    if (!videoPath) {
      console.log(`⚠️ No videos found in ${channel.folder}`);
      return;
    }

    console.log(`\n▶ Starting new REEL upload for ${channelArg}`);
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
    console.log(`Published. post_id=${result.post_id}`);
    clearPending(channelArg);

    if (videoPath) markDone(videoPath);
    return;
  }

  console.warn("Publish succeeded but no post_id. Keeping pending ID.\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

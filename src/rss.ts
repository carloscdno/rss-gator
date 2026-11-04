import { XMLParser } from "fast-xml-parser";

export type RSSFeed = {
  channel: {
    title: string;
    link: string;
    description: string;
    item: RSSItem[];
  };
};

export type RSSItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return decodeHtmlEntities(value.trim());
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function fetchFeed(feedURL: string): Promise<RSSFeed> {
  // 1. Fetch the RSS feed
  const response = await fetch(feedURL, {
    headers: {
      "User-Agent": "gator",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch RSS feed: ${response.status} ${response.statusText}`,
    );
  }

  const xml = await response.text();

  // 2. Parse the XML
  const parser = new XMLParser({
    processEntities: false,
  });

  const parsed: unknown = parser.parse(xml);

  // 3. Extract the channel
 if (!isRecord(parsed)) {
  throw new Error("Invalid RSS feed: invalid XML structure");
}

const rssRoot = isRecord(parsed.rss) ? parsed.rss : parsed;

if (!isRecord(rssRoot.channel)) {
  throw new Error("Invalid RSS feed: channel not found");
}

const channel = rssRoot.channel;

  // 4. Extract channel metadata
  const title = getString(channel.title);
  const link = getString(channel.link);
  const description = getString(channel.description);

  if (!title || !link || !description) {
    throw new Error("Invalid RSS feed: missing channel metadata");
  }

  // 5. Extract feed items
  const rawItems = channel.item;

  let items: unknown[] = [];

  if (Array.isArray(rawItems)) {
    items = rawItems;
  } else if (isRecord(rawItems)) {
    items = [rawItems];
  }

  const validItems: RSSItem[] = [];

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    const itemTitle = getString(item.title);
    const itemLink = getString(item.link);
    const itemDescription = getString(item.description);
    const pubDate = getString(item.pubDate);

    if (!itemTitle || !itemLink || !itemDescription || !pubDate) {
      continue;
    }

    validItems.push({
      title: itemTitle,
      link: itemLink,
      description: itemDescription,
      pubDate,
    });
  }

  // 6. Assemble and return the RSS feed
  return {
    channel: {
      title,
      link,
      description,
      item: validItems,
    },
  };
}

export function parsePublishedAt(
  value: unknown,
): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
import { readConfig, setUser } from "./config.js";
import {
  createFeed,
  getFeeds,
  getFeedByUrl,
  createFeedFollow,
  getFeedFollowsForUser,
  deleteFeedFollow,
  getNextFeedToFetch,
  markFeedFetched,
} from "./db/queries/feeds.js";
import { fetchFeed, parsePublishedAt } from "./rss.js";
import type { User } from "./db/schema.js";
import { createUser, deleteAllUsers, getUserByName, getUsers } from "./db/queries/users.js";
import { createPost, getPostsForUser } from "./db/queries/posts.js";

type CommandHandler = (
  cmdName: string,
  ...args: string[]
) => Promise<void>;

type UserCommandHandler = (
  cmdName: string,
  user: User,
  ...args: string[]
) => Promise<void>;

type CommandsRegistry = Record<string, CommandHandler>;

function middlewareLoggedIn(
  handler: UserCommandHandler,
): CommandHandler {
  return async (cmdName: string, ...args: string[]): Promise<void> => {
    const config = readConfig();

    if (!config.currentUserName) {
      throw new Error("No user is currently logged in");
    }

    const user = await getUserByName(config.currentUserName);

    if (!user) {
      throw new Error(`User ${config.currentUserName} not found`);
    }

    await handler(cmdName, user, ...args);
  };
}

function registerCommand(
  registry: CommandsRegistry,
  cmdName: string,
  handler: CommandHandler
): void {
  registry[cmdName] = handler;
}

async function runCommand(
  registry: CommandsRegistry,
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const handler = registry[cmdName];

  if (!handler) {
    throw new Error(`Unknown command: ${cmdName}`);
  }

  await handler(cmdName, ...args);
}

async function handlerLogin(
  _cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length === 0) {
    throw new Error("Username is required");
  }

  const name = args[0];

  const user = await getUserByName(name);

  if (!user) {
    throw new Error(`User ${name} does not exist`);
  }

  const config = readConfig();
  setUser(config, name);

  console.log(`User set to ${name}`);
}

async function handlerRegister(
  _cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length === 0) {
    throw new Error("Username is required");
  }

  const name = args[0];

  const existingUser = await getUserByName(name);

  if (existingUser) {
    throw new Error(`User ${name} already exists`);
  }

  const user = await createUser(name);

  const config = readConfig();
  setUser(config, name);

  console.log(`User ${name} was created successfully!`);
  console.log(user);
}

async function handlerReset(
  _cmdName: string,
  ..._args: string[]
): Promise<void> {
  await deleteAllUsers();

  console.log("Database reset successfully!");
}

async function handlerUsers(
  _cmdName: string,
  ..._args: string[]
): Promise<void> {
  const users = await getUsers();
  const config = readConfig();

  for (const user of users) {
    const current = user.name === config.currentUserName
      ? " (current)"
      : "";

    console.log(`* ${user.name}${current}`);
  }
}

async function handlerAgg(
  _cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw new Error("Usage: agg <time_between_reqs>");
  }

  const timeBetweenRequests = parseDuration(args[0]);

  if (timeBetweenRequests <= 0) {
    throw new Error("The duration must be greater than zero.");
  }

  console.log(
    `Collecting feeds every ${formatDuration(timeBetweenRequests)}`,
  );

  function handleError(error: unknown): void {
    console.error("Error scraping feeds:", error);
  }

  scrapeFeeds().catch(handleError);

  const interval = setInterval(() => {
    scrapeFeeds().catch(handleError);
  }, timeBetweenRequests);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      console.log("\nShutting down feed aggregator...");
      clearInterval(interval);
      resolve();
    });
  });
}

async function handlerAddFeed(
  _cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 2) {
    throw new Error("Usage: addfeed <name> <url>");
  }

  const [name, url] = args;

  const feed = await createFeed(name, url, user.id);

  const feedFollow = await createFeedFollow(user.id, feed.id);

  printFeedFollow(feedFollow);
}

async function handlerFeeds(
  _cmdName: string,
  ...args: string[]
): Promise<void> {
  if (args.length !== 0) {
    throw new Error("The feeds command does not accept arguments");
  }

  const feeds = await getFeeds();

  if (feeds.length === 0) {
    console.log("No feeds found.");
    return;
  }

  for (const feed of feeds) {
    console.log(`Name: ${feed.name}`);
    console.log(`URL: ${feed.url}`);
    console.log(`User: ${feed.userName}`);
    console.log("--------------------");
  }
}

function printFeedFollow(feedFollow: {
  feedName: string;
  userName: string;
}): void {
  console.log(`${feedFollow.userName} is following ${feedFollow.feedName}`);
}

async function handlerFollow(
  _cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw new Error("Usage: follow <url>");
  }

  const feed = await getFeedByUrl(args[0]);

  if (!feed) {
    throw new Error(`Feed with URL ${args[0]} not found`);
  }

  const feedFollow = await createFeedFollow(user.id, feed.id);

  printFeedFollow(feedFollow);
}

async function handlerFollowing(
  _cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 0) {
    throw new Error("The following command does not accept arguments");
  }

  const feedFollows = await getFeedFollowsForUser(user.id);

  if (feedFollows.length === 0) {
    console.log(`${user.name} is not following any feeds.`);
    return;
  }

  console.log(`${user.name} is following:`);

  for (const feedFollow of feedFollows) {
    console.log(`- ${feedFollow.feedName}`);
  }
}

async function handlerUnfollow(
  _cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length !== 1) {
    throw new Error("Usage: unfollow <url>");
  }

  const feed = await getFeedByUrl(args[0]);

  if (!feed) {
    throw new Error(`Feed with URL ${args[0]} not found`);
  }

  await deleteFeedFollow(user.id, feed.id);

  console.log(`${user.name} unfollowed ${feed.name}`);
}

async function scrapeFeeds(): Promise<void> {
  const feed = await getNextFeedToFetch();

  if (!feed) {
    console.log("No feeds available to scrape.");
    return;
  }

  console.log(`Fetching feed: ${feed.name} (${feed.url})`);

  const rssFeed = await fetchFeed(feed.url);

  await markFeedFetched(feed.id);

  for (const item of rssFeed.channel.item) {
    const publishedAt = parsePublishedAt(item.pubDate);

    await createPost({
      title: item.title,
      url: item.link,
      description: item.description ?? null,
      publishedAt,
      feedId: feed.id,
    });

    console.log(`Saved post: ${item.title}`);
  }
}

function parseDuration(durationStr: string): number {
  const regex = /^(\d+)(ms|s|m|h)$/;
  const match = durationStr.match(regex);

  if (!match) {
    throw new Error(
      "Invalid duration. Use a format like 500ms, 1s, 1m, or 1h.",
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    default:
      throw new Error("Unsupported duration unit.");
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${minutes}m${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }

  return `${seconds}s`;
}

async function handlerBrowse(
  cmdName: string,
  user: User,
  ...args: string[]
): Promise<void> {
  if (args.length > 1) {
    throw new Error("Usage: browse [limit]");
  }

  const limit = args.length === 0 ? 2 : Number(args[0]);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Limit must be a positive integer.");
  }

  const posts = await getPostsForUser(user.id, limit);

  if (posts.length === 0) {
    console.log("No posts found.");
    return;
  }

  for (const post of posts) {
    console.log(`Title: ${post.title}`);
    console.log(`URL: ${post.url}`);
    console.log(`Feed: ${post.feedName}`);
    console.log(
      `Published: ${post.publishedAt?.toISOString() ?? "Unknown"}`,
    );
    console.log(`Description: ${post.description ?? "No description"}`);
    console.log("-----------------------------------");
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("No command provided");
    process.exit(1);
  }

  const cmdName = args[0];
  const cmdArgs = args.slice(1);

  const registry: CommandsRegistry = {};

  registerCommand(registry, "login", handlerLogin);
  registerCommand(registry, "register", handlerRegister);
  registerCommand(registry, "reset", handlerReset);
  registerCommand(registry, "users", handlerUsers);
  registerCommand(registry, "agg", handlerAgg);
  registerCommand(registry, "addfeed", middlewareLoggedIn(handlerAddFeed));
  registerCommand(registry, "feeds", handlerFeeds);
  registerCommand(registry, "follow", middlewareLoggedIn(handlerFollow));
  registerCommand(registry, "following", middlewareLoggedIn(handlerFollowing));
  registerCommand(registry, "unfollow", middlewareLoggedIn(handlerUnfollow));
  registerCommand(registry, "browse", middlewareLoggedIn(handlerBrowse));

  try {
    await runCommand(registry, cmdName, ...cmdArgs);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
}

main();
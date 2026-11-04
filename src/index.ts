import { readConfig, setUser } from "./config.js";
import {
  createFeed,
  getFeeds,
  getFeedByUrl,
  createFeedFollow,
  getFeedFollowsForUser,
} from "./db/queries/feeds.js";
import { fetchFeed } from "./rss.js";
import type { Feed, User } from "./db/schema.js";
import { createUser, deleteAllUsers, getUserByName, getUsers } from "./db/queries/users.js";

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
  cmdName: string,
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
  cmdName: string,
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
  cmdName: string,
  ...args: string[]
): Promise<void> {
  await deleteAllUsers();

  console.log("Database reset successfully!");
}

async function handlerUsers(
  cmdName: string,
  ...args: string[]
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
  cmdName: string,
  ...args: string[]
): Promise<void> {
  const feed = await fetchFeed("https://www.wagslane.dev/index.xml");

  console.log(JSON.stringify(feed, null, 2));
}

function printFeed(feed: Feed, user: User): void {
  console.log("Feed created successfully!");
  console.log(`ID: ${feed.id}`);
  console.log(`Name: ${feed.name}`);
  console.log(`URL: ${feed.url}`);
  console.log(`User: ${user.name}`);
  console.log(`User ID: ${feed.userId}`);
  console.log(`Created at: ${feed.createdAt}`);
}

async function handlerAddFeed(
  cmdName: string,
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
  cmdName: string,
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
  cmdName: string,
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
  cmdName: string,
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

  try {
    await runCommand(registry, cmdName, ...cmdArgs);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
}

main();
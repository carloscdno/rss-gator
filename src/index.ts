import { readConfig, setUser } from "./config.js";
import {
  createUser,
  getUserByName,
  deleteAllUsers,
  getUsers,
} from "./db/queries/users.js";

type CommandHandler = (
  cmdName: string,
  ...args: string[]
) => Promise<void>;

type CommandsRegistry = Record<string, CommandHandler>;

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

  try {
    await runCommand(registry, cmdName, ...cmdArgs);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
}

main();
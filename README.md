
# Gator

Gator is a command-line RSS feed aggregator built with TypeScript, Node.js, and PostgreSQL.

It allows users to register, follow RSS feeds, collect posts, and browse the latest articles from their followed feeds.

## Requirements

Before using Gator, make sure you have:

- **Node.js** installed.
- **PostgreSQL** installed and running.
- **npm** installed.
- **Git** installed (if cloning the repository).

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd rss-gator
```

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

## Configuration

Gator requires a configuration file named `.gatorconfig.json` in your home directory.

Create the file and add your PostgreSQL connection string:

```json
{
  "db_url": "postgres://username:password@localhost:5432/gator"
}
```

Replace `username`, `password`, and `gator` with your PostgreSQL username, password, and database name.

Make sure the database exists before running Gator.

Run the database migrations:

```bash
npx drizzle-kit migrate
```

The configuration file is created outside the repository, so it should not be committed to Git.

## Usage

Run Gator commands using:

```bash
npm run start <command> [arguments]
```

### Available commands

| Command | Description |
|---|---|
| `register <username>` | Register a new user. |
| `login <username>` | Log in as an existing user. |
| `users` | List all registered users. |
| `reset` | Delete all users and related data. |
| `addfeed <name> <url>` | Add a new RSS feed and follow it. |
| `feeds` | List all registered feeds. |
| `follow <url>` | Follow an existing feed. |
| `following` | List the feeds followed by the current user. |
| `unfollow <url>` | Unfollow a feed. |
| `agg <duration>` | Continuously fetch RSS feeds at the specified interval. |
| `browse [limit]` | Browse the latest posts from followed feeds. |

### Example workflow

Register a user:

```bash
npm run start register alice
```

Log in:

```bash
npm run start login alice
```

Add RSS feeds:

```bash
npm run start addfeed "TechCrunch" "https://techcrunch.com/feed/"
npm run start addfeed "Hacker News" "https://news.ycombinator.com/rss"
```

List followed feeds:

```bash
npm run start following
```

Start the feed aggregator:

```bash
npm run start agg 1m
```

The aggregator runs continuously, fetching feeds according to the specified interval.

Press `Ctrl+C` to stop it.

Browse the latest posts in another terminal:

```bash
npm run start browse
```

By default, this displays the two latest posts. You can specify a different limit:

```bash
npm run start browse 10
```

## Technologies

- TypeScript
- Node.js
- PostgreSQL
- Drizzle ORM
- fast-xml-parser
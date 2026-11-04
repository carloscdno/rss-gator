import { desc, eq } from "drizzle-orm";

import { db } from "../index.js";
import { feedFollows, feeds, posts } from "../schema.js";

export type CreatePostParams = {
  title: string;
  url: string;
  description?: string | null;
  publishedAt?: Date | null;
  feedId: string;
};

export async function createPost(params: CreatePostParams): Promise<void> {
  await db
    .insert(posts)
    .values({
      title: params.title,
      url: params.url,
      description: params.description ?? null,
      publishedAt: params.publishedAt ?? null,
      feedId: params.feedId,
    })
    .onConflictDoNothing();
}

export async function getPostsForUser(
  userId: string,
  limit: number,
) {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      url: posts.url,
      description: posts.description,
      publishedAt: posts.publishedAt,
      feedName: feeds.name,
    })
    .from(posts)
    .innerJoin(feeds, eq(posts.feedId, feeds.id))
    .innerJoin(feedFollows, eq(feedFollows.feedId, feeds.id))
    .where(eq(feedFollows.userId, userId))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(limit);
}
import {
  pgTable,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull(),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url").notNull(),

  headline: text("headline").notNull(),
  content: text("content"),

  tags: jsonb("tags").$type(),
  s3_key: text("s3_key"),
  metadata: jsonb("metadata"),
});

export const instagramPosts = pgTable("instagram_posts", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull(),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url").notNull(),

  caption: text("caption"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

export const tweets = pgTable("tweets", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull(),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url").notNull(),

  content: text("content"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

export const tiktokPosts = pgTable("tiktok_posts", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull(),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url").notNull(),

  caption: text("caption"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

export const newsletters = pgTable("newsletters", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull(),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url"),

  subjectLine: text("subject_line").notNull(),
  content: text("content"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

export const failedItems = pgTable("failed_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: text("source").notNull(),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  error: text("error").notNull(),
  rawData: jsonb("raw_data"),
});

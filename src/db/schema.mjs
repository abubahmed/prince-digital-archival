import {
  pgTable,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const articles = pgTable("articles", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp"),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url"),

  headline: text("headline"),
  content: text("content"),

  tags: jsonb("tags").$type(),
  s3_key: text("s3_key"),
  metadata: jsonb("metadata"),
});

export const instagramPosts = pgTable("instagram_posts", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp"),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url"),

  caption: text("caption"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

export const tweets = pgTable("tweets", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp"),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url"),

  content: text("content"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

export const tiktokPosts = pgTable("tiktok_posts", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp"),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url"),

  caption: text("caption"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

export const newsletters = pgTable("newsletters", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp"),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
  url: text("url"),

  subjectLine: text("subject_line"),
  content: text("content"),

  metadata: jsonb("metadata"),
  s3_key: text("s3_key"),
});

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const knowledgeRecords = sqliteTable("knowledge_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  score: integer("score").notNull().default(0)
});

export const skills = sqliteTable("skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  level: text("level").notNull().default("core")
});

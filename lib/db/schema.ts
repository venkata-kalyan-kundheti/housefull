/**
 * lib/db/schema.ts
 *
 * Drizzle ORM schema matching Section 13 authoritative SQL definition.
 */

import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const theaters = pgTable(
  "theaters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    timeZone: text("time_zone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("lat_check", sql`${table.lat} >= -90 and ${table.lat} <= 90`),
    check("lon_check", sql`${table.lon} >= -180 and ${table.lon} <= 180`),
  ]
);

export const films = pgTable("films", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull().unique(),
  year: integer("year"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const shows = pgTable(
  "shows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    theaterId: uuid("theater_id")
      .notNull()
      .references(() => theaters.id, { onDelete: "cascade" }),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    screen: integer("screen").notNull(),
    capacity: integer("capacity").notNull(),
    sold: integer("sold").notNull(),
    source: text("source", { enum: ["synthetic", "csv"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("screen_check", sql`${table.screen} >= 1`),
    check("capacity_check", sql`${table.capacity} > 0`),
    check("sold_check", sql`${table.sold} >= 0`),
    check("sold_le_capacity", sql`${table.sold} <= ${table.capacity}`),
    index("shows_theater_starts_idx").on(table.theaterId, table.startsAt),
  ]
);

export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    showId: uuid("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    inputHash: text("input_hash").notNull(),
    mode: text("mode", { enum: ["live", "replay"] }).notNull(),
    confidenceLevel: text("confidence_level", {
      enum: ["high", "medium", "low"],
    }).notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("briefs_show_idx").on(table.showId, sql`${table.createdAt} desc`),
    uniqueIndex("briefs_hash_mode_idx").on(
      table.showId,
      table.inputHash,
      table.mode
    ),
  ]
);

export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  showId: uuid("show_id")
    .notNull()
    .references(() => shows.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["running", "finished", "failed"],
  }).notNull(),
  errorCode: text("error_code"),
  events: jsonb("events").default(sql`'[]'::jsonb`).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const qlooCache = pgTable(
  "qloo_cache",
  {
    key: text("key").primaryKey(),
    endpoint: text("endpoint").notNull(),
    payload: jsonb("payload").notNull(),
    status: integer("status").notNull(),
    resultCount: integer("result_count").notNull(),
    compactionVersion: integer("compaction_version").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("qloo_cache_expires_idx").on(table.expiresAt)]
);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => briefs.id, { onDelete: "cascade" }),
  selectedChannelIds: jsonb("selected_channel_ids").notNull(),
  selectedCopy: jsonb("selected_copy").default(sql`'[]'::jsonb`).notNull(),
  offerText: text("offer_text"),
  offerSlug: text("offer_slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .unique()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    baseline: doublePrecision("baseline").notNull(),
    mdeAbs: doublePrecision("mde_abs").notNull(),
    alpha: doublePrecision("alpha").default(0.05).notNull(),
    power: doublePrecision("power").default(0.8).notNull(),
    nPerArm: integer("n_per_arm").notNull(),
    splitMethod: text("split_method", {
      enum: ["list_split", "geo_split"],
    })
      .default("list_split")
      .notNull(),
    baselineIsDefault: boolean("baseline_is_default").default(true).notNull(),
    results: jsonb("results"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("baseline_check", sql`${table.baseline} > 0 and ${table.baseline} < 1`),
    check("mde_abs_check", sql`${table.mdeAbs} > 0`),
  ]
);

export const offerClaims = pgTable(
  "offer_claims",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    src: text("src").notNull(),
    count: integer("count").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.src] }),
  ]
);

export const geocodeCache = pgTable("geocode_cache", {
  geohash: text("geohash").primaryKey(),
  label: text("label").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

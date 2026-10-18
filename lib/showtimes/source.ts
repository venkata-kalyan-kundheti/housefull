/**
 * lib/showtimes/source.ts
 *
 * ShowtimeSource interface as specified in Section 9.10.
 */

export interface ShowtimeRecord {
  id?: string;
  theaterId: string;
  filmId: string;
  startsAt: string; // ISO string
  screen: number;
  capacity: number;
  sold: number;
  source: "synthetic" | "csv";
}

export interface ShowtimeSource {
  kind: "synthetic" | "csv";
  listShows(args: {
    theaterId: string;
    fromIso: string;
    toIso: string;
  }): Promise<ShowtimeRecord[]>;
}

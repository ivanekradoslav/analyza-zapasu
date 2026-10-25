import Dexie, { type EntityTable } from "dexie";
import type {
  Clip,
  Drawing,
  Player,
  Playlist,
  Project,
  TagEvent,
  TagType,
} from "@/types";

export class MatchAnalysisDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  players!: EntityTable<Player, "id">;
  tagTypes!: EntityTable<TagType, "id">;
  tagEvents!: EntityTable<TagEvent, "id">;
  drawings!: EntityTable<Drawing, "id">;
  clips!: EntityTable<Clip, "id">;
  playlists!: EntityTable<Playlist, "id">;

  constructor() {
    super("analyza-zapasu");
    this.version(1).stores({
      projects: "id, name, updatedAt",
      players: "id, projectId, [projectId+order]",
      tagTypes: "id, projectId, [projectId+order]",
      tagEvents: "id, projectId, tagTypeId, playerId, timestamp, [projectId+half]",
      drawings: "id, projectId, timestamp",
      clips: "id, projectId, createdAt",
      playlists: "id, projectId, updatedAt",
    });
  }
}

export const db = new MatchAnalysisDB();

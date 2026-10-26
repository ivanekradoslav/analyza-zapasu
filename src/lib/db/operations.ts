import { db } from "@/lib/db/db";
import { DEFAULT_TAGS } from "@/lib/db/defaultTags";
import { isTrackDrawing, trackWindow } from "@/lib/drawing/keyframes";
import { newId } from "@/lib/utils/id";
import type {
  Clip,
  Drawing,
  Player,
  Playlist,
  Project,
  ProjectExport,
  TagEvent,
  TagType,
} from "@/types";

// --- Projekty ---

export async function createProject(input: {
  name: string;
  opponent: string;
  date: string;
  competition: string;
}): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: newId(),
    name: input.name,
    opponent: input.opponent,
    date: input.date,
    competition: input.competition,
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(project);

  // Zasejeme predvolené tagy pre nový projekt.
  const tagTypes: TagType[] = DEFAULT_TAGS.map((t, idx) => ({
    id: newId(),
    projectId: project.id,
    name: t.name,
    shortcut: t.shortcut,
    category: t.category,
    color: t.color,
    isDefault: true,
    order: idx,
  }));
  await db.tagTypes.bulkAdd(tagTypes);

  return project;
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteProject(id: string) {
  await db.transaction(
    "rw",
    [db.projects, db.players, db.tagTypes, db.tagEvents, db.drawings, db.clips, db.playlists],
    async () => {
      await db.projects.delete(id);
      await db.players.where("projectId").equals(id).delete();
      await db.tagTypes.where("projectId").equals(id).delete();
      await db.tagEvents.where("projectId").equals(id).delete();
      await db.drawings.where("projectId").equals(id).delete();
      await db.clips.where("projectId").equals(id).delete();
      await db.playlists.where("projectId").equals(id).delete();
    }
  );
}

// --- Hráči ---

export async function addPlayer(projectId: string, input: Omit<Player, "id" | "projectId" | "order">) {
  const count = await db.players.where("projectId").equals(projectId).count();
  const player: Player = { ...input, id: newId(), projectId, order: count };
  await db.players.add(player);
  return player;
}

export async function updatePlayer(id: string, patch: Partial<Player>) {
  await db.players.update(id, patch);
}

export async function deletePlayer(id: string) {
  await db.players.delete(id);
}

// --- Typy tagov ---

export async function addTagType(projectId: string, input: Omit<TagType, "id" | "projectId" | "order" | "isDefault">) {
  const count = await db.tagTypes.where("projectId").equals(projectId).count();
  const tagType: TagType = { ...input, id: newId(), projectId, order: count, isDefault: false };
  await db.tagTypes.add(tagType);
  return tagType;
}

export async function updateTagType(id: string, patch: Partial<TagType>) {
  await db.tagTypes.update(id, patch);
}

export async function deleteTagType(id: string) {
  await db.transaction("rw", [db.tagTypes, db.tagEvents], async () => {
    await db.tagTypes.delete(id);
    await db.tagEvents.where("tagTypeId").equals(id).delete();
  });
}

// --- Udalosti (tagy v čase) ---

export async function addTagEvent(input: Omit<TagEvent, "id" | "createdAt">) {
  const event: TagEvent = { ...input, id: newId(), createdAt: Date.now() };
  await db.tagEvents.add(event);
  return event;
}

export async function updateTagEvent(id: string, patch: Partial<TagEvent>) {
  await db.tagEvents.update(id, patch);
}

export async function deleteTagEvent(id: string) {
  await db.tagEvents.delete(id);
}

// --- Kresby ---

export async function upsertDrawing(drawing: Drawing) {
  await db.drawings.put(drawing);
}

export async function deleteDrawing(id: string) {
  await db.drawings.delete(id);
}

export async function findDrawingForEdit(projectId: string, timestamp: number, epsilon = 0.4) {
  const all = await db.drawings.where("projectId").equals(projectId).toArray();
  const track = all.find((d) => {
    if (!isTrackDrawing(d)) return false;
    const { start, end } = trackWindow(d);
    return timestamp >= start - epsilon && timestamp <= end + epsilon;
  });
  return track ?? all.find((d) => !isTrackDrawing(d) && Math.abs(d.timestamp - timestamp) <= epsilon);
}

// --- Klipy ---

export async function addClip(input: Omit<Clip, "id" | "createdAt">) {
  const clip: Clip = { ...input, id: newId(), createdAt: Date.now() };
  await db.clips.add(clip);
  return clip;
}

export async function updateClip(id: string, patch: Partial<Clip>) {
  await db.clips.update(id, patch);
}

export async function deleteClip(id: string) {
  await db.transaction("rw", [db.clips, db.playlists], async () => {
    await db.clips.delete(id);
    const playlists = await db.playlists.toArray();
    for (const pl of playlists) {
      if (pl.clipIds.includes(id)) {
        await db.playlists.update(pl.id, {
          clipIds: pl.clipIds.filter((c) => c !== id),
          updatedAt: Date.now(),
        });
      }
    }
  });
}

// --- Playlisty ---

export async function createPlaylist(projectId: string, name: string, clipIds: string[] = []) {
  const now = Date.now();
  const playlist: Playlist = { id: newId(), projectId, name, clipIds, createdAt: now, updatedAt: now };
  await db.playlists.add(playlist);
  return playlist;
}

export async function updatePlaylist(id: string, patch: Partial<Playlist>) {
  await db.playlists.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deletePlaylist(id: string) {
  await db.playlists.delete(id);
}

// --- Export / import projektu ---

export async function exportProjectJson(projectId: string): Promise<ProjectExport> {
  const [project, players, tagTypes, tagEvents, drawings, clips, playlists] = await Promise.all([
    db.projects.get(projectId),
    db.players.where("projectId").equals(projectId).toArray(),
    db.tagTypes.where("projectId").equals(projectId).toArray(),
    db.tagEvents.where("projectId").equals(projectId).toArray(),
    db.drawings.where("projectId").equals(projectId).toArray(),
    db.clips.where("projectId").equals(projectId).toArray(),
    db.playlists.where("projectId").equals(projectId).toArray(),
  ]);
  if (!project) throw new Error("Projekt sa nenašiel");
  return { version: 1, project, players, tagTypes, tagEvents, drawings, clips, playlists };
}

export async function importProjectJson(data: ProjectExport): Promise<string> {
  const newProjectId = newId();
  const idMap = new Map<string, string>();
  idMap.set(data.project.id, newProjectId);

  const remapId = (oldId: string) => {
    let id = idMap.get(oldId);
    if (!id) {
      id = newId();
      idMap.set(oldId, id);
    }
    return id;
  };

  const now = Date.now();
  const project: Project = {
    ...data.project,
    id: newProjectId,
    createdAt: now,
    updatedAt: now,
  };

  const players: Player[] = data.players.map((p) => ({ ...p, id: remapId(p.id), projectId: newProjectId }));
  const tagTypes: TagType[] = data.tagTypes.map((t) => ({ ...t, id: remapId(t.id), projectId: newProjectId }));
  const tagEvents: TagEvent[] = data.tagEvents.map((e) => ({
    ...e,
    id: remapId(e.id),
    projectId: newProjectId,
    tagTypeId: remapId(e.tagTypeId),
    playerId: e.playerId ? remapId(e.playerId) : undefined,
  }));
  const drawings: Drawing[] = data.drawings.map((d) => ({ ...d, id: remapId(d.id), projectId: newProjectId }));
  const clips: Clip[] = data.clips.map((c) => ({
    ...c,
    id: remapId(c.id),
    projectId: newProjectId,
    sourceTagEventId: c.sourceTagEventId ? remapId(c.sourceTagEventId) : undefined,
    playerIds: c.playerIds?.map(remapId),
  }));
  const playlists: Playlist[] = data.playlists.map((pl) => ({
    ...pl,
    id: remapId(pl.id),
    projectId: newProjectId,
    clipIds: pl.clipIds.map((cid) => remapId(cid)),
  }));

  await db.transaction(
    "rw",
    [db.projects, db.players, db.tagTypes, db.tagEvents, db.drawings, db.clips, db.playlists],
    async () => {
      await db.projects.add(project);
      if (players.length) await db.players.bulkAdd(players);
      if (tagTypes.length) await db.tagTypes.bulkAdd(tagTypes);
      if (tagEvents.length) await db.tagEvents.bulkAdd(tagEvents);
      if (drawings.length) await db.drawings.bulkAdd(drawings);
      if (clips.length) await db.clips.bulkAdd(clips);
      if (playlists.length) await db.playlists.bulkAdd(playlists);
    }
  );

  return newProjectId;
}

import { sql, toIsoString, type SqlParameter } from "./db";
import type { OutfitHistoryRecord, OutfitHistorySummary, OutfitInspirationRequest, OutfitInspirationResult } from "./outfit-types";

const TABLE_NAME = "outfit_records";

const EMPTY_REQUEST: OutfitInspirationRequest = {
  season: "",
  profile: {
    favoriteColors: [],
    stylePreferences: [],
    makeupPreference: "",
  },
  scene: "daily",
  occasion: "",
  mood: "",
  weather: null,
};

const EMPTY_RESULT: OutfitInspirationResult = {
  theme: "",
  color_palette: [],
  item_recommendations: {
    top: "",
    bottom: "",
    outerwear: "",
    shoes: "",
    bag: "",
    accessories: "",
  },
  makeup_advice: "",
  reason: "",
};

interface OutfitRecordRow {
  id: string | number;
  user_id: string;
  request: Partial<OutfitInspirationRequest> | null;
  result: Partial<OutfitInspirationResult> | null;
  source: string | null;
  image_url: string | null;
  outfit_id: string | null;
  result_id: string | null;
  created_at: string | null;
}

function toFullRecord(row: OutfitRecordRow): OutfitHistoryRecord {
  const id = String(row.id);
  const request = row.request && typeof row.request === "object" ? row.request : {};
  const result = row.result && typeof row.result === "object" ? row.result : {};
  return {
    id,
    userId: typeof row.user_id === "string" ? row.user_id : "",
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    source: row.source === "ai" ? "ai" : "mock",
    outfitId: row.outfit_id ?? id,
    resultId: row.result_id ?? id,
    imageUrl: typeof row.image_url === "string" && row.image_url.trim() ? row.image_url : undefined,
    request: {
      ...EMPTY_REQUEST,
      ...request,
      profile: {
        ...EMPTY_REQUEST.profile,
        ...(request.profile ?? {}),
      },
      weather:
        request.weather && typeof request.weather === "object"
          ? {
              city: typeof request.weather.city === "string" ? request.weather.city : "",
              temperature: typeof request.weather.temperature === "string" ? request.weather.temperature : "",
              condition: typeof request.weather.condition === "string" ? request.weather.condition : "",
            }
          : null,
    },
    result: {
      ...EMPTY_RESULT,
      ...result,
      item_recommendations: {
        ...EMPTY_RESULT.item_recommendations,
        ...(result.item_recommendations ?? {}),
      },
      color_palette: Array.isArray(result.color_palette) ? result.color_palette.filter((item): item is string => typeof item === "string") : [],
    },
  };
}

function toSummary(record: OutfitHistoryRecord): OutfitHistorySummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    source: record.source,
    outfitId: record.outfitId,
    resultId: record.resultId,
    imageUrl: record.imageUrl,
    season: record.request.season,
    scene: record.request.scene,
    occasion: record.request.occasion,
    mood: record.request.mood,
    city: record.request.weather?.city ?? "",
    theme: record.result.theme,
    colorPalette: record.result.color_palette,
  };
}

const SELECT_COLUMNS = `
  id, user_id, request, result, source, image_url, outfit_id, result_id, created_at
`;

export async function createUserOutfitRecord(
  userId: string,
  input: {
    request: OutfitInspirationRequest;
    result: OutfitInspirationResult;
    source: "mock" | "ai";
    imageUrl?: string;
  },
) {
  const inserted = await sql<{ id: number }>(
    `INSERT INTO ${TABLE_NAME} (user_id, request, result, source, image_url)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
     RETURNING id`,
    [userId, JSON.stringify(input.request), JSON.stringify(input.result), input.source, input.imageUrl ?? null],
  );
  const id = inserted[0]?.id;
  if (id === undefined) {
    throw new Error("创建穿搭记录失败。");
  }

  const recordId = String(id);
  await sql(
    `UPDATE ${TABLE_NAME} SET outfit_id = $2, result_id = $3 WHERE id = $1::bigint`,
    [recordId, recordId, recordId],
  );
  return recordId;
}

export async function listUserOutfitRecords(userId: string) {
  const rows = await sql<OutfitRecordRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${TABLE_NAME} WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((row) => toSummary(toFullRecord(row)));
}

export async function getUserOutfitRecord(id: string, userId: string) {
  const rows = await sql<OutfitRecordRow>(`SELECT ${SELECT_COLUMNS} FROM ${TABLE_NAME} WHERE id = $1::bigint LIMIT 1`, [
    id,
  ]);
  const row = rows[0];
  if (!row) {
    return null;
  }

  const record = toFullRecord(row);
  return record.userId === userId ? record : null;
}

export async function deleteUserOutfitRecord(id: string, userId: string) {
  const record = await getUserOutfitRecord(id, userId);
  if (!record) {
    return false;
  }

  await sql(`DELETE FROM ${TABLE_NAME} WHERE id = $1::bigint`, [id]);
  return true;
}

export async function updateUserOutfitRecord(
  id: string,
  userId: string,
  input: Partial<{
    request: Partial<OutfitInspirationRequest>;
    result: Partial<OutfitInspirationResult>;
    source: "mock" | "ai";
    imageUrl: string;
  }>,
) {
  const record = await getUserOutfitRecord(id, userId);
  if (!record) {
    return null;
  }

  const sets: string[] = [];
  const params: SqlParameter[] = [];
  let paramIndex = 1;

  if (input.request) {
    sets.push(`request = request || $${paramIndex}::jsonb`);
    params.push(JSON.stringify(input.request));
    paramIndex += 1;
  }
  if (input.result) {
    sets.push(`result = result || $${paramIndex}::jsonb`);
    params.push(JSON.stringify(input.result));
    paramIndex += 1;
  }
  if (input.source) {
    sets.push(`source = $${paramIndex}`);
    params.push(input.source);
    paramIndex += 1;
  }
  if (typeof input.imageUrl === "string") {
    sets.push(`image_url = $${paramIndex}`);
    params.push(input.imageUrl ? input.imageUrl : null);
    paramIndex += 1;
  }

  if (sets.length > 0) {
    params.push(id);
    await sql(`UPDATE ${TABLE_NAME} SET ${sets.join(", ")} WHERE id = $${paramIndex}::bigint`, params);
  }

  return id;
}

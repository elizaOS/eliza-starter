import type { Character } from "@ai16z/eliza";
import {
  CacheManager,
  DbCacheAdapter,
  FsCacheAdapter,
  IDatabaseCacheAdapter,
} from "@ai16z/eliza";
import path from "path";

export function intializeFsCache(baseDir: string, character: Character) {
  const cacheDir = path.resolve(baseDir, character.id, "cache");

  const cache = new CacheManager(new FsCacheAdapter(cacheDir));
  return cache;
}

export function intializeDbCache(
  character: Character,
  db: IDatabaseCacheAdapter
) {
  const cache = new CacheManager(new DbCacheAdapter(db, character.id));
  return cache;
}

import type { Database } from '../data/Database';
import { createNewState, migrateState, type GameState } from '../model/GameState';

// Unity: File.WriteAllText(Path.Combine(Application.persistentDataPath, "save.json"), json)
const SAVE_KEY = 'sumbi.save.v1';

export function loadGame(db: Database): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrateState(JSON.parse(raw), db);
  } catch (e) {
    console.warn('세이브 로드 실패, 새 게임으로 시작합니다.', e);
  }
  return createNewState(db);
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('세이브 저장 실패', e);
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 저장소 접근 불가 환경은 무시
  }
}

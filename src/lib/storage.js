/**
 * Centralized localStorage abstraction.
 * All 30+ localStorage keys are defined here as constants.
 * Includes a migration function to preserve data from the old static site.
 */

// ── Key Constants ──
export const KEYS = {
  THEME:           'site_theme',
  WRONG_ANSWERS:   'wrong_answers',
  MASTERY_DATA:    'mastery_data',
  EXAM_CLASS_ID:   'exam_class_id',
  EXAM_DELETED:    'exam_deleted',
  CHANGELOG_SEEN:  'changelog_seen',
  REWARD_DISMISSED:'reward_dismissed',
  VISIT_COUNT:     'visit_count',
  GUIDE_DONE:      'guide_done',
  MIGRATE_DISMISSED:'migrate_dismissed',
  // Dynamic keys (prefix + variable suffix)
  SCROLL_PREFIX:   'scroll_',
  VISITS_PREFIX:   'visits_',
  DWELL_PREFIX:    'dwell_',
  CHAPTER_DONE_PREFIX: 'chapter_done_',
  SG_DONE_PREFIX:  'sg_done_',
  // Course-specific
  ALGO_VISITED:    'algo_visited',
  ALGO_QUIZ:       'algo_quiz',
  MARX_KNOWN:      'mk',
  MARX_UPDATE_V2:  'marx_update_v2',
  DSP_QUIZ_PROGRESS:'dsp-quiz-progress',
}

// ── Low-level helpers ──
export function getLS(key, defaultValue) {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (e) {
    return defaultValue
  }
}

export function setLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {}
}

export function removeLS(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {}
}

// ── Migration ──
const MIGRATION_FLAG = 'site_migrated_to_vue_v1'

/**
 * Ensures all existing localStorage data from the old static site
 * is preserved when the user first visits the React version.
 *
 * This is a no-op if migration has already run.
 * It NEVER deletes or overwrites existing keys.
 */
export function runMigration() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return

    // List all known key prefixes to verify they exist
    const knownPrefixes = [
      KEYS.THEME, KEYS.WRONG_ANSWERS, KEYS.MASTERY_DATA,
      KEYS.EXAM_CLASS_ID, KEYS.EXAM_DELETED,
      KEYS.CHANGELOG_SEEN, KEYS.REWARD_DISMISSED,
      KEYS.VISIT_COUNT, KEYS.GUIDE_DONE, KEYS.MIGRATE_DISMISSED,
      KEYS.ALGO_VISITED, KEYS.ALGO_QUIZ, KEYS.MARX_KNOWN,
      KEYS.MARX_UPDATE_V2, KEYS.DSP_QUIZ_PROGRESS,
    ]

    // Log existing keys for debugging (dev only)
    if (import.meta.env.DEV) {
      const existing = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k) existing.push(k)
      }
      console.log('[storage] Existing localStorage keys:', existing.length)
      console.log('[storage] Theme:', getLS(KEYS.THEME, 'dark'))
      console.log('[storage] Wrong answers:', getLS(KEYS.WRONG_ANSWERS, []).length)
      console.log('[storage] Mastery data:', Object.keys(getLS(KEYS.MASTERY_DATA, {})))
    }

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG, '1')
  } catch (e) {
    console.warn('[storage] Migration check failed:', e)
  }
}

/**
 * Get all dwell time data (aggregated across all pages).
 * Used by HomePage to display cumulative study time.
 */
export function getTotalDwellTime() {
  let total = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(KEYS.DWELL_PREFIX)) {
        const data = JSON.parse(localStorage.getItem(key))
        if (data && typeof data === 'object') {
          Object.values(data).forEach(v => {
            if (typeof v === 'number') total += v
          })
        }
      }
    }
  } catch (e) {}
  return total
}

/**
 * Get all chapter completion data for a specific course page.
 * Used by ChapterProgress component.
 */
export function getChapterDone(pageId) {
  return getLS(KEYS.CHAPTER_DONE_PREFIX + pageId, {})
}

export function setChapterDone(pageId, state) {
  setLS(KEYS.CHAPTER_DONE_PREFIX + pageId, state)
}

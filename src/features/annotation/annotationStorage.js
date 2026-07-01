const LS_KEY = 'annotations_v2'

export function loadAnnotations(pathname) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const all = JSON.parse(raw)
    return all[pathname] || []
  } catch { return [] }
}

export function saveAnnotation(pathname, ann) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const all = raw ? JSON.parse(raw) : {}
    if (!all[pathname]) all[pathname] = []
    const idx = all[pathname].findIndex(a => a.id === ann.id)
    if (idx >= 0) all[pathname][idx] = ann
    else all[pathname].push(ann)
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch (e) { console.warn('annotation save failed', e) }
}

export function removeAnnotation(pathname, id) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const all = JSON.parse(raw)
    if (!all[pathname]) return
    all[pathname] = all[pathname].filter(a => a.id !== id)
    if (!all[pathname].length) delete all[pathname]
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch (e) { console.warn('annotation remove failed', e) }
}

export function getAllAnnotations() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

import { useParams } from 'react-router-dom'

/**
 * Returns the current course page ID from the route.
 * Replaces the duplicated getPageId() found in 6+ modules.
 *
 * @returns {string|null} - e.g. 'probability', 'os', 'algorithm', etc.
 */
export default function usePageId() {
  const { courseId } = useParams()
  return courseId || null
}

// Heuristic, not perfect — but good enough to decide "does this browser
// have its own decent camera pointed at the outside world" (a phone) vs
// "this is a laptop or a car's built-in touchscreen, so borrow a phone's
// camera wirelessly instead."
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return true
  // iPadOS reports as "Macintosh" with touch support — treat touch tablets as mobile too.
  if (/iPad/i.test(ua)) return true
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

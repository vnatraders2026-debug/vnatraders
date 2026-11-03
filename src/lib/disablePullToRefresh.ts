/**
 * Disables native mobile browser pull-down-to-refresh while preserving
 * smooth inner scrolling on tables, search lists, and page contents.
 */
export function disablePullToRefresh(): void {
  if (typeof window === 'undefined') return;

  let touchStartY = 0;

  window.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const currentY = e.touches[0].clientY;
      const isPullingDown = currentY > touchStartY;

      // When at the very top of the window / document, prevent pull-to-refresh reload
      const isAtTop = window.scrollY <= 0 && document.documentElement.scrollTop <= 0;

      if (isPullingDown && isAtTop) {
        let target = e.target as HTMLElement | null;
        let hasInternalScroll = false;

        // Check if user is scrolling inside an element with internal scroll offset
        while (target && target !== document.body && target !== document.documentElement) {
          if (target.scrollTop > 0) {
            hasInternalScroll = true;
            break;
          }
          target = target.parentElement;
        }

        if (!hasInternalScroll && e.cancelable) {
          e.preventDefault();
        }
      }
    },
    { passive: false }
  );
}


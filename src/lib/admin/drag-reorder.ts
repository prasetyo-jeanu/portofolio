export interface FloatingDragSession {
  floatingEl: HTMLElement;
  placeholder: HTMLElement;
  restore: () => void;
}

export interface DragReorderOptions {
  container: HTMLElement;
  itemSelector: string;
  handleSelector?: string;
  draggingBodyClass?: string;
  createFloating: (item: HTMLElement, startRect: DOMRect) => FloatingDragSession;
  onOrderChange?: (placeholder: HTMLElement, draggedItem: HTMLElement) => void;
  onDragEnd?: (draggedItem: HTMLElement) => void | Promise<void>;
}

/**
 * Attaches pointer-based vertical drag-and-drop reordering with auto-scroll to a list or tbody.
 */
export function attachDragReorder(options: DragReorderOptions): void {
  const {
    container,
    itemSelector,
    handleSelector = '[data-drag-handle]',
    draggingBodyClass = 'drag-reordering',
    createFloating,
    onOrderChange,
    onDragEnd,
  } = options;

  container.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>(handleSelector);
    if (!handle) return;

    const draggedItem = handle.closest<HTMLElement>(itemSelector);
    if (!draggedItem || draggedItem.parentElement !== container) return;
    if (container.querySelectorAll(itemSelector).length < 2) return;

    event.preventDefault();
    const pointerId = event.pointerId;
    const startRect = draggedItem.getBoundingClientRect();
    const grabOffsetY = event.clientY - startRect.top;
    const itemHeight = startRect.height;

    const { floatingEl, placeholder, restore } = createFloating(draggedItem, startRect);
    document.body.classList.add(draggingBodyClass);

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Ignore if synthetic pointer cannot be captured
    }

    let lastClientY = event.clientY;
    let rafId = 0;

    const updatePosition = () => {
      const floatingTop = lastClientY - grabOffsetY;
      const floatingBottom = floatingTop + itemHeight;
      floatingEl.style.top = `${floatingTop}px`;

      const placeholderRect = placeholder.getBoundingClientRect();
      const siblings = Array.from(container.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.matches(itemSelector),
      );

      if (floatingTop > placeholderRect.top) {
        let targetAfter: HTMLElement | null = null;
        for (const sib of siblings) {
          const isAfter = Boolean(
            placeholder.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
          if (!isAfter) continue;
          const rect = sib.getBoundingClientRect();
          if (floatingBottom > rect.top + rect.height / 2) {
            targetAfter = sib;
          }
        }
        if (targetAfter) {
          container.insertBefore(placeholder, targetAfter.nextElementSibling);
          onOrderChange?.(placeholder, draggedItem);
        }
      } else if (floatingTop < placeholderRect.top) {
        let targetBefore: HTMLElement | null = null;
        for (const sib of siblings) {
          const isBefore = Boolean(
            sib.compareDocumentPosition(placeholder) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
          if (!isBefore) continue;
          const rect = sib.getBoundingClientRect();
          if (floatingTop < rect.top + rect.height / 2) {
            targetBefore = sib;
            break;
          }
        }
        if (targetBefore) {
          container.insertBefore(placeholder, targetBefore);
          onOrderChange?.(placeholder, draggedItem);
        }
      }
    };

    const tickAutoScroll = () => {
      const edgeZone = 84;
      let scrollDelta = 0;
      if (lastClientY < edgeZone) {
        scrollDelta = -Math.max(4, Math.round(((edgeZone - lastClientY) / edgeZone) * 14));
      } else if (lastClientY > window.innerHeight - edgeZone) {
        scrollDelta = Math.max(
          4,
          Math.round(((lastClientY - (window.innerHeight - edgeZone)) / edgeZone) * 14),
        );
      }

      if (scrollDelta !== 0) {
        const prevY = window.scrollY;
        window.scrollBy(0, scrollDelta);
        if (window.scrollY !== prevY) {
          updatePosition();
        }
      }
      rafId = window.requestAnimationFrame(tickAutoScroll);
    };

    rafId = window.requestAnimationFrame(tickAutoScroll);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      lastClientY = moveEvent.clientY;
      updatePosition();
    };

    const finishDrag = () => {
      window.cancelAnimationFrame(rafId);
      restore();
      document.body.classList.remove(draggingBodyClass);

      try {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore release errors
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('blur', finishDrag);
      void onDragEnd?.(draggedItem);
    };

    const onPointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      finishDrag();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', finishDrag);
  });
}

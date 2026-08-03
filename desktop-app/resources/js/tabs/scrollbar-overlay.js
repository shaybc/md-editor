// Provides the transient, draggable horizontal scrollbar shown over document tabs.
(function(global) {
  global.createMarkdownViewerTabScrollbarOverlay = function createMarkdownViewerTabScrollbarOverlay(options) {
    const tabBar = options?.tabBar || null;
    const tabList = options?.tabList || null;
    const hideDelayMs = Number.isFinite(options?.hideDelayMs) ? options.hideDelayMs : 1000;
    if (!tabBar || !tabList) return null;

    const overlay = document.createElement("div");
    overlay.className = "tab-scrollbar-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const thumb = document.createElement("div");
    thumb.className = "tab-scrollbar-overlay-thumb";
    overlay.appendChild(thumb);
    tabBar.appendChild(overlay);

    let hideTimer = null;
    let isDragging = false;
    let dragStartClientX = 0;
    let dragStartScrollLeft = 0;

    function hasOverflow() {
      return tabList.scrollWidth > tabList.clientWidth + 1;
    }

    function clearHideTimer() {
      if (hideTimer !== null) global.clearTimeout(hideTimer);
      hideTimer = null;
    }

    function hide() {
      if (isDragging || overlay.matches(":hover")) return;
      overlay.classList.remove("visible");
    }

    function scheduleHide() {
      clearHideTimer();
      hideTimer = global.setTimeout(hide, hideDelayMs);
    }

    /** Reveal the overlay temporarily while the tab row is being interacted with. */
    function reveal() {
      if (!hasOverflow()) return;
      overlay.classList.add("visible");
      scheduleHide();
    }

    /** Synchronize overlay bounds and thumb position with the native tab scroll state. */
    function update() {
      const overflow = hasOverflow();
      overlay.classList.toggle("has-overflow", overflow);
      if (!overflow) {
        clearHideTimer();
        overlay.classList.remove("visible");
        return;
      }

      overlay.style.left = tabList.offsetLeft + "px";
      overlay.style.width = tabList.clientWidth + "px";
      const trackWidth = tabList.clientWidth;
      const thumbWidth = Math.max(32, Math.min(trackWidth, trackWidth * (tabList.clientWidth / tabList.scrollWidth)));
      const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
      const maxScrollLeft = Math.max(1, tabList.scrollWidth - tabList.clientWidth);
      thumb.style.width = thumbWidth + "px";
      thumb.style.transform = "translateX(" + (maxThumbLeft * (tabList.scrollLeft / maxScrollLeft)) + "px)";
    }

    function scrollFromPointer(clientX) {
      const rect = overlay.getBoundingClientRect();
      const thumbWidth = thumb.getBoundingClientRect().width;
      const maxThumbLeft = Math.max(0, rect.width - thumbWidth);
      const thumbLeft = Math.max(0, Math.min(maxThumbLeft, clientX - rect.left - (thumbWidth / 2)));
      const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
      tabList.scrollLeft = maxThumbLeft > 0 ? (thumbLeft / maxThumbLeft) * maxScrollLeft : 0;
      update();
    }

    function handleWheel(event) {
      if (!hasOverflow()) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      tabList.scrollLeft += delta;
      reveal();
      update();
    }

    function handleScroll() {
      update();
      reveal();
    }

    overlay.addEventListener("pointerdown", function(event) {
      if (!hasOverflow()) return;
      event.preventDefault();
      clearHideTimer();
      overlay.classList.add("visible", "dragging");
      if (event.target !== thumb) scrollFromPointer(event.clientX);
      isDragging = true;
      dragStartClientX = event.clientX;
      dragStartScrollLeft = tabList.scrollLeft;
      overlay.setPointerCapture?.(event.pointerId);
    });

    overlay.addEventListener("pointermove", function(event) {
      if (!isDragging) return;
      const trackWidth = overlay.clientWidth;
      const thumbWidth = thumb.getBoundingClientRect().width;
      const maxThumbTravel = Math.max(1, trackWidth - thumbWidth);
      const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
      tabList.scrollLeft = dragStartScrollLeft + ((event.clientX - dragStartClientX) / maxThumbTravel) * maxScrollLeft;
      update();
    });

    function finishDragging(event) {
      if (!isDragging) return;
      isDragging = false;
      overlay.classList.remove("dragging");
      overlay.releasePointerCapture?.(event.pointerId);
      scheduleHide();
    }

    overlay.addEventListener("pointerup", finishDragging);
    overlay.addEventListener("pointercancel", finishDragging);
    overlay.addEventListener("pointerenter", clearHideTimer);
    overlay.addEventListener("pointerleave", scheduleHide);
    tabList.addEventListener("pointerenter", reveal);
    tabList.addEventListener("pointermove", reveal);
    tabList.addEventListener("pointerleave", scheduleHide);
    tabList.addEventListener("wheel", handleWheel, { passive: false });
    tabList.addEventListener("scroll", handleScroll);

    const resizeObserver = typeof global.ResizeObserver === "function"
      ? new global.ResizeObserver(update)
      : null;
    resizeObserver?.observe(tabList);
    update();

    return {
      update,
      reveal,
      destroy: function destroy() {
        clearHideTimer();
        resizeObserver?.disconnect();
        tabList.removeEventListener("wheel", handleWheel);
        tabList.removeEventListener("scroll", handleScroll);
        overlay.remove();
      }
    };
  };
})(window);

(function(global) {
  global.registerMarkdownViewerMermaidTools = function registerMarkdownViewerMermaidTools(app, deps) {
    let addMermaidToolbars;
    const markdownPreview = deps.markdownPreview;

  // ========================================
  // MERMAID DIAGRAM TOOLBAR
  // ========================================

  /**
   * Serialises an SVG element to a data URL suitable for use as an image source.
   * Inline styles and dimensions are preserved so the PNG matches the rendered diagram.
   */
  function svgToDataUrl(svgEl) {
    const clone = svgEl.cloneNode(true);
    // Ensure explicit width/height so the canvas has the right dimensions
    const bbox = svgEl.getBoundingClientRect();
    if (!clone.getAttribute('width'))  clone.setAttribute('width',  Math.round(bbox.width));
    if (!clone.getAttribute('height')) clone.setAttribute('height', Math.round(bbox.height));
    const serialized = new XMLSerializer().serializeToString(clone);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);
  }

  /**
   * Renders an SVG element onto a canvas and resolves with the canvas.
   */
  function svgToCanvas(svgEl) {
    return new Promise((resolve, reject) => {
      const bbox = svgEl.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const width  = Math.max(Math.round(bbox.width),  1);
      const height = Math.max(Math.round(bbox.height), 1);

      const canvas = document.createElement('canvas');
      canvas.width  = width  * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Fill background matching current theme using the CSS variable value
      const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-color').trim() || '#ffffff';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      const img = new Image();
      img.onload  = () => { ctx.drawImage(img, 0, 0, width, height); resolve(canvas); };
      img.onerror = reject;
      img.src = svgToDataUrl(svgEl);
    });
  }

  /** Downloads the diagram in the given container as a PNG file. */
  async function downloadMermaidPng(container, btn) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      const canvas = await svgToCanvas(svgEl);
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diagram-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        btn.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      }, 'image/png');
    } catch (e) {
      console.error('Mermaid PNG export failed:', e);
      btn.innerHTML = original;
    }
  }

  /** Copies the diagram in the given container as a PNG image to the clipboard. */
  async function copyMermaidImage(container, btn) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      const canvas = await svgToCanvas(svgEl);
      canvas.toBlob(async blob => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          btn.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
        } catch (clipErr) {
          console.error('Clipboard write failed:', clipErr);
          btn.innerHTML = '<i class="bi bi-x-lg"></i>';
        }
        setTimeout(() => { btn.innerHTML = original; }, 1800);
      }, 'image/png');
    } catch (e) {
      console.error('Mermaid copy failed:', e);
      btn.innerHTML = original;
    }
  }

  /** Downloads the SVG source of a diagram. */
  function downloadMermaidSvg(container, btn) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;
    const clone = svgEl.cloneNode(true);
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check-lg"></i>';
    setTimeout(() => { btn.innerHTML = original; }, 1500);
  }

  // ---- Zoom modal state ----
  let modalZoomScale = 1;
  let modalPanX = 0;
  let modalPanY = 0;
  let modalIsDragging = false;
  let modalDragStart = { x: 0, y: 0 };
  let modalCurrentSvgEl = null;

  const mermaidZoomModal   = document.getElementById('mermaid-zoom-modal');
  const mermaidModalDiagram = document.getElementById('mermaid-modal-diagram');

  function applyModalTransform() {
    if (modalCurrentSvgEl) {
      modalCurrentSvgEl.style.transform =
        `translate(${modalPanX}px, ${modalPanY}px) scale(${modalZoomScale})`;
    }
  }

  function closeMermaidModal() {
    if (!mermaidZoomModal.classList.contains('active')) return;
    mermaidZoomModal.classList.remove('active');
    mermaidModalDiagram.innerHTML = '';
    modalCurrentSvgEl = null;
    modalZoomScale = 1;
    modalPanX = 0;
    modalPanY = 0;
  }

  /** Opens the zoom modal with the SVG from the given container. */
  function openMermaidZoomModal(container) {
    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    mermaidModalDiagram.innerHTML = '';
    modalZoomScale = 1;
    modalPanX = 0;
    modalPanY = 0;

    const svgClone = svgEl.cloneNode(true);
    // Remove fixed dimensions so it sizes naturally inside the modal
    svgClone.removeAttribute('width');
    svgClone.removeAttribute('height');
    svgClone.style.width  = 'auto';
    svgClone.style.height = 'auto';
    svgClone.style.maxWidth  = '80vw';
    svgClone.style.maxHeight = '60vh';
    svgClone.style.transformOrigin = 'center';
    mermaidModalDiagram.appendChild(svgClone);
    modalCurrentSvgEl = svgClone;

    mermaidZoomModal.classList.add('active');
  }

  // Modal close button
  document.getElementById('mermaid-modal-close').addEventListener('click', closeMermaidModal);
  // Click backdrop to close
  mermaidZoomModal.addEventListener('click', function(e) {
    if (e.target === mermaidZoomModal) closeMermaidModal();
  });

  // Zoom controls
  document.getElementById('mermaid-modal-zoom-in').addEventListener('click', () => {
    modalZoomScale = Math.min(modalZoomScale + 0.25, 10);
    applyModalTransform();
  });
  document.getElementById('mermaid-modal-zoom-out').addEventListener('click', () => {
    modalZoomScale = Math.max(modalZoomScale - 0.25, 0.1);
    applyModalTransform();
  });
  document.getElementById('mermaid-modal-zoom-reset').addEventListener('click', () => {
    modalZoomScale = 1; modalPanX = 0; modalPanY = 0;
    applyModalTransform();
  });

  // Mouse-wheel zoom inside modal
  mermaidModalDiagram.addEventListener('wheel', function(e) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    modalZoomScale = Math.min(Math.max(modalZoomScale + delta, 0.1), 10);
    applyModalTransform();
  }, { passive: false });

  // Drag to pan inside modal
  mermaidModalDiagram.addEventListener('mousedown', function(e) {
    modalIsDragging = true;
    modalDragStart = { x: e.clientX - modalPanX, y: e.clientY - modalPanY };
    mermaidModalDiagram.classList.add('dragging');
  });
  document.addEventListener('mousemove', function(e) {
    if (!modalIsDragging) return;
    modalPanX = e.clientX - modalDragStart.x;
    modalPanY = e.clientY - modalDragStart.y;
    applyModalTransform();
  });
  document.addEventListener('mouseup', function() {
    if (modalIsDragging) {
      modalIsDragging = false;
      mermaidModalDiagram.classList.remove('dragging');
    }
  });

  // Modal download buttons (operate on the currently displayed SVG)
  document.getElementById('mermaid-modal-download-png').addEventListener('click', async function() {
    if (!modalCurrentSvgEl) return;
    const btn = this;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      // Use the original SVG (with dimensions) for proper PNG rendering
      const canvas = await svgToCanvas(modalCurrentSvgEl);
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `diagram-${Date.now()}.png`; a.click();
        URL.revokeObjectURL(url);
        btn.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => { btn.innerHTML = original; }, 1500);
      }, 'image/png');
    } catch (e) {
      console.error('Modal PNG export failed:', e);
      btn.innerHTML = original;
    }
  });

  document.getElementById('mermaid-modal-copy').addEventListener('click', async function() {
    if (!modalCurrentSvgEl) return;
    const btn = this;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      const canvas = await svgToCanvas(modalCurrentSvgEl);
      canvas.toBlob(async blob => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          btn.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
        } catch (clipErr) {
          console.error('Clipboard write failed:', clipErr);
          btn.innerHTML = '<i class="bi bi-x-lg"></i>';
        }
        setTimeout(() => { btn.innerHTML = original; }, 1800);
      }, 'image/png');
    } catch (e) {
      console.error('Modal copy failed:', e);
      btn.innerHTML = original;
    }
  });

  document.getElementById('mermaid-modal-download-svg').addEventListener('click', function() {
    if (!modalCurrentSvgEl) return;
    const serialized = new XMLSerializer().serializeToString(modalCurrentSvgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diagram-${Date.now()}.svg`; a.click();
    URL.revokeObjectURL(url);
  });

  /**
   * Adds the hover toolbar to every rendered Mermaid container.
   * Safe to call multiple times – existing toolbars are not duplicated.
   */
  addMermaidToolbars = function addMermaidToolbars() {
    markdownPreview.querySelectorAll('.mermaid-container').forEach(container => {
      if (container.querySelector('.mermaid-toolbar')) return; // already added
      const svgEl = container.querySelector('svg');
      if (!svgEl) return; // diagram not yet rendered

      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';
      toolbar.setAttribute('aria-label', 'Diagram actions');

      const btnZoom = document.createElement('button');
      btnZoom.className = 'mermaid-toolbar-btn';
      btnZoom.title = 'Zoom diagram';
      btnZoom.setAttribute('aria-label', 'Zoom diagram');
      btnZoom.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
      btnZoom.addEventListener('click', () => openMermaidZoomModal(container));

      const btnPng = document.createElement('button');
      btnPng.className = 'mermaid-toolbar-btn';
      btnPng.title = 'Download PNG';
      btnPng.setAttribute('aria-label', 'Download PNG');
      btnPng.innerHTML = '<i class="bi bi-file-image"></i> PNG';
      btnPng.addEventListener('click', () => downloadMermaidPng(container, btnPng));

      const btnCopy = document.createElement('button');
      btnCopy.className = 'mermaid-toolbar-btn';
      btnCopy.title = 'Copy image to clipboard';
      btnCopy.setAttribute('aria-label', 'Copy image to clipboard');
      btnCopy.innerHTML = '<i class="bi bi-clipboard-image"></i> Copy';
      btnCopy.addEventListener('click', () => copyMermaidImage(container, btnCopy));

      const btnSvg = document.createElement('button');
      btnSvg.className = 'mermaid-toolbar-btn';
      btnSvg.title = 'Download SVG';
      btnSvg.setAttribute('aria-label', 'Download SVG');
      btnSvg.innerHTML = '<i class="bi bi-filetype-svg"></i> SVG';
      btnSvg.addEventListener('click', () => downloadMermaidSvg(container, btnSvg));

      toolbar.appendChild(btnZoom);
      toolbar.appendChild(btnCopy);
      toolbar.appendChild(btnPng);
      toolbar.appendChild(btnSvg);
      container.appendChild(toolbar);
    });
  };
    return { addMermaidToolbars, closeMermaidModal };
  };
})(window);

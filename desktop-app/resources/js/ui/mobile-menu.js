(function(window) {
  "use strict";

  function registerMarkdownViewerMobileMenu(app, deps) {
    const mobileMenuToggle = deps.mobileMenuToggle;
    const mobileMenuPanel = deps.mobileMenuPanel;
    const mobileMenuOverlay = deps.mobileMenuOverlay;
    const mobileCloseMenu = deps.mobileCloseMenu;
    const mobileImportBtn = deps.mobileImportBtn;
    const mobileImportGithubBtn = deps.mobileImportGithubBtn;
    const mobileExportMd = deps.mobileExportMd;
    const mobileExportHtml = deps.mobileExportHtml;
    const mobileExportPdf = deps.mobileExportPdf;
    const mobileCopyMarkdown = deps.mobileCopyMarkdown;
    const mobileThemeToggle = deps.mobileThemeToggle;
    const mobileNewTabBtn = deps.mobileNewTabBtn;
    const mobileTabResetBtn = deps.mobileTabResetBtn;

    function openMobileMenu() {
      if (mobileMenuPanel) mobileMenuPanel.classList.add("active");
      if (mobileMenuOverlay) mobileMenuOverlay.classList.add("active");
    }

    function closeMobileMenu() {
      if (mobileMenuPanel) mobileMenuPanel.classList.remove("active");
      if (mobileMenuOverlay) mobileMenuOverlay.classList.remove("active");
    }

    function bindClick(element, handler) {
      if (element) element.addEventListener("click", handler);
    }

    function bindMobileMenu() {
      bindClick(mobileMenuToggle, openMobileMenu);
      bindClick(mobileCloseMenu, closeMobileMenu);
      bindClick(mobileMenuOverlay, closeMobileMenu);

      bindClick(mobileImportBtn, function() {
        deps.openDocumentFileFromPicker();
      });
      bindClick(mobileImportGithubBtn, function() {
        closeMobileMenu();
        deps.openGitHubImportModal();
      });
      bindClick(mobileExportMd, function() {
        deps.exportMd.click();
      });
      bindClick(mobileExportHtml, function() {
        deps.exportHtml.click();
      });
      bindClick(mobileExportPdf, function() {
        deps.exportPdf.click();
      });
      bindClick(mobileCopyMarkdown, function() {
        deps.copyMarkdownButton.click();
      });
      bindClick(mobileThemeToggle, function() {
        deps.themeToggle.click();
      });
      bindClick(mobileNewTabBtn, function() {
        deps.newTab();
        closeMobileMenu();
      });
      bindClick(mobileTabResetBtn, function() {
        closeMobileMenu();
        deps.resetAllTabs();
      });
    }

    const api = {
      bindMobileMenu,
      closeMobileMenu,
      openMobileMenu
    };

    app.registerModule("mobileMenu", api);
    return api;
  }

  window.registerMarkdownViewerMobileMenu = registerMarkdownViewerMobileMenu;
})(window);

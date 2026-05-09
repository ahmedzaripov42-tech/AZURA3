document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("filterSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggles = document.querySelectorAll(".toggle-filters");
  const desktopQuery = window.matchMedia("(min-width: 1280px)");

  if (!sidebar) {
    return;
  }

  function syncBodyLock() {
    if (desktopQuery.matches) {
      document.body.classList.remove("overflow-hidden");
      return;
    }

    if (sidebar.classList.contains("-translate-x-full")) {
      document.body.classList.remove("overflow-hidden");
    } else {
      document.body.classList.add("overflow-hidden");
    }
  }

  function openSidebar() {
    if (desktopQuery.matches) {
      return;
    }
    sidebar.classList.remove("-translate-x-full");
    if (overlay) {
      overlay.classList.remove("hidden");
    }
    syncBodyLock();
  }

  function closeSidebar() {
    if (desktopQuery.matches) {
      if (overlay) {
        overlay.classList.add("hidden");
      }
      document.body.classList.remove("overflow-hidden");
      return;
    }
    sidebar.classList.add("-translate-x-full");
    if (overlay) {
      overlay.classList.add("hidden");
    }
    syncBodyLock();
  }

  toggles.forEach((button) => {
    button.addEventListener("click", () => {
      if (desktopQuery.matches) {
        return;
      }
      if (sidebar.classList.contains("-translate-x-full")) {
        openSidebar();
      } else {
        closeSidebar();
      }
    });
  });

  if (overlay) {
    overlay.addEventListener("click", closeSidebar);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });

  if (typeof desktopQuery.addEventListener === "function") {
    desktopQuery.addEventListener("change", closeSidebar);
  } else if (typeof desktopQuery.addListener === "function") {
    desktopQuery.addListener(closeSidebar);
  }

  document.querySelectorAll(".filter-header").forEach((header) => {
    header.addEventListener("click", () => {
      const content = header.nextElementSibling;
      const arrow = header.querySelector(".filter-arrow");
      if (!content || !arrow) {
        return;
      }
      content.classList.toggle("hidden");
      arrow.classList.toggle("rotate-180");
    });
  });

  syncBodyLock();
});

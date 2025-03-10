document.addEventListener("DOMContentLoaded", function () {
  // Handle form submission
  const analyzeForm = document.getElementById("analyzeForm");
  if (analyzeForm) {
    analyzeForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const branch = document.getElementById("branch").value || "main";
      const forceRefresh = document.getElementById("forceRefresh").checked;

      // Show analysis status
      document.getElementById("analyzeForm").classList.add("hidden");
      document.getElementById("analysisStatus").classList.remove("hidden");

      // Trigger GitHub workflow
      triggerAnalysis(branch, forceRefresh);
    });
  }

  // Tab functionality
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      // Remove active class from all tabs
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));

      // Add active class to clicked tab
      this.classList.add("active");
      const tabId = this.getAttribute("data-tab");
      document.getElementById(tabId + "-content").classList.add("active");
    });
  });

  // Search functionality
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", filterDependencies);
  }

  // Directory filter
  const directoryFilter = document.getElementById("directoryFilter");
  if (directoryFilter) {
    directoryFilter.addEventListener("change", filterDependencies);
  }

  // Directory stat click
  document.querySelectorAll(".directory-stat").forEach((dirStat) => {
    dirStat.addEventListener("click", function () {
      const directory = this.getAttribute("data-directory");
      document.getElementById("directoryFilter").value = directory;

      // Switch to the dependencies tab
      document.querySelector('.tab[data-tab="all-deps"]').click();

      filterDependencies();
    });
  });

  // Initialize syntax highlighting for code tooltips
  if (typeof hljs !== "undefined") {
    document.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block);
    });
  }

  // Improve tooltip positioning
  document.querySelectorAll(".file-path").forEach((filePath) => {
    filePath.addEventListener("mouseenter", function () {
      const tooltip = this.querySelector(".code-tooltip");
      if (!tooltip) return;

      // Check if tooltip would go off-screen to the right
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      if (tooltipRect.right > viewportWidth) {
        tooltip.style.left = "auto";
        tooltip.style.right = "100%";
        tooltip.style.marginLeft = "0";
        tooltip.style.marginRight = "10px";
      }
    });
  });

  // Generate graphs if available
  if (document.querySelector(".graph-container")) {
    generateGraphs();
  }

  // Modal functionality
  const modal = document.getElementById("dependencyModal");
  const modalContent = modal.querySelector(".modal-body .dependency-files");
  const closeModal = modal.querySelector(".close-modal");

  // Close modal when clicking the close button
  closeModal.addEventListener("click", () => {
    modal.classList.remove("show");
  });

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("show");
    }
  });

  // Handle "Open Details" button clicks
  document.querySelectorAll(".open-details").forEach((button) => {
    button.addEventListener("click", function () {
      const depId = this.getAttribute("data-dep-id");
      const dependency = document.querySelector(
        `.dependency[data-id="${depId}"]`
      );

      if (!dependency) return;

      // Get all file paths and their data
      const files = Array.from(dependency.querySelectorAll(".file-path")).map(
        (el) => ({
          path: el.textContent.trim(),
        })
      );

      // Get the raw data from analyze-dependencies.js output
      const rawData = dependency.getAttribute("data-raw");
      let importDetails = [];

      try {
        importDetails = JSON.parse(rawData);
      } catch (e) {
        console.warn("Could not parse import details", e);
      }

      // Generate modal content
      modalContent.innerHTML = `
        <h3>Circular Dependency Chain</h3>
        <div class="cycle-visualization">
          ${files
            .map(
              (file, index) => `
            ${file.path}
            ${
              index < files.length - 1
                ? '<span class="arrow">→</span>'
                : '<span class="arrow">→</span>'
            }
          `
            )
            .join("")}
          ${files[0].path}
        </div>
        
        <h3 class="mt-4">Import Details</h3>
        ${files
          .map((file, index) => {
            const nextFile = files[(index + 1) % files.length];
            const importDetail = importDetails.find(
              (d) => d.source === file.path && d.target === nextFile.path
            );

            return `
            <div class="dependency-detail">
              <div class="detail-header">
                ${file.path} → ${nextFile.path}
              </div>
              ${
                importDetail
                  ? `
                <div class="detail-code">
                  <pre><code class="language-typescript">// Line ${importDetail.lineNumber}
${importDetail.code}</code></pre>
                </div>
              `
                  : ""
              }
            </div>
          `;
          })
          .join("")}
      `;

      // Initialize syntax highlighting for new content
      if (typeof hljs !== "undefined") {
        modalContent.querySelectorAll("pre code").forEach((block) => {
          hljs.highlightElement(block);
        });
      }

      // Show modal
      modal.classList.add("show");
    });
  });
});

// Filter dependencies based on search and directory filter
function filterDependencies() {
  const searchInput = document.getElementById("searchInput");
  const directoryFilter = document.getElementById("directoryFilter");

  if (!searchInput || !directoryFilter) return;

  const searchTerm = searchInput.value.toLowerCase();
  const directoryValue = directoryFilter.value;
  const dependencies = document.querySelectorAll(".dependency");

  dependencies.forEach((dep) => {
    const filePaths = dep.querySelectorAll(".file-path");
    let matchesSearch = searchTerm === "";
    let matchesDirectory = directoryValue === "";

    filePaths.forEach((path) => {
      if (path.textContent.toLowerCase().includes(searchTerm)) {
        matchesSearch = true;
      }
    });

    if (directoryValue) {
      const directories = dep.getAttribute("data-directories");
      if (directories && directories.split(",").includes(directoryValue)) {
        matchesDirectory = true;
      }
    }

    if (matchesSearch && matchesDirectory) {
      dep.classList.remove("hidden");
    } else {
      dep.classList.add("hidden");
    }
  });
}

// Generate graph visualizations for circular dependencies
function generateGraphs() {
  document.querySelectorAll(".graph-container").forEach((container) => {
    const depId = container.id.replace("graph-", "");
    const dependency = document.querySelector(
      `.dependency[data-id="${depId}"]`
    );
    if (!dependency) return;

    const filePaths = Array.from(dependency.querySelectorAll(".file-path")).map(
      (el) => el.textContent
    );

    // Create nodes
    const nodeWidth = 120;
    const nodeHeight = 30;
    const centerX = container.offsetWidth / 2;
    const centerY = container.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) - nodeHeight - 10;

    filePaths.forEach((file, index) => {
      // Calculate position in a circle
      const angle = (index / filePaths.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle) - nodeWidth / 2;
      const y = centerY + radius * Math.sin(angle) - nodeHeight / 2;

      // Create node
      const node = document.createElement("div");
      node.className = "graph-node";
      node.textContent = file.split("/").pop(); // Just show filename
      node.setAttribute("title", file);
      node.style.left = x + "px";
      node.style.top = y + "px";
      container.appendChild(node);

      // Create edge to next node
      const nextIndex = (index + 1) % filePaths.length;
      const nextAngle = (nextIndex / filePaths.length) * 2 * Math.PI;
      const nextX = centerX + radius * Math.cos(nextAngle);
      const nextY = centerY + radius * Math.sin(nextAngle);

      const dx = nextX - (x + nodeWidth / 2);
      const dy = nextY - (y + nodeHeight / 2);
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle2 = Math.atan2(dy, dx);

      const edge = document.createElement("div");
      edge.className = "graph-edge";
      edge.style.width = length - nodeWidth / 2 + "px";
      edge.style.left = x + nodeWidth / 2 + "px";
      edge.style.top = y + nodeHeight / 2 + "px";
      edge.style.transform = "rotate(" + angle2 + "rad)";
      container.appendChild(edge);
    });
  });
}

// Trigger GitHub workflow via API
async function triggerAnalysis(branch, forceRefresh) {
  try {
    // GitHub API requires authentication, so we'll use a serverless function or GitHub Action
    // For this demo, we'll simulate by redirecting to a URL that would trigger the workflow
    const repoOwner = "your-username"; // Replace with your GitHub username
    const repoName = "cal-dependency-analyzer"; // Replace with your repo name

    // In a real implementation, you would make an API call to trigger the workflow
    // For now, we'll redirect to a URL that explains how to manually trigger it
    const workflowUrl = `https://github.com/${repoOwner}/${repoName}/actions/workflows/analyze.yml`;

    // Simulate analysis time with a timeout
    setTimeout(() => {
      // In a real implementation, you would poll for completion
      // For now, we'll just redirect to the workflow page
      window.location.href = `${workflowUrl}?query=branch:${branch}`;
    }, 2000);

    // In a production implementation, you would:
    // 1. Call a serverless function that triggers the workflow via GitHub API
    // 2. Get the run ID from the response
    // 3. Poll for completion status
    // 4. Redirect to results when complete
  } catch (error) {
    console.error("Error triggering analysis:", error);
    alert("Error triggering analysis. Please try again.");

    // Reset UI
    document.getElementById("analyzeForm").classList.remove("hidden");
    document.getElementById("analysisStatus").classList.add("hidden");
  }
}

// Add CSS styles for graph nodes and edges
function addGraphStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .graph-node {
      position: absolute;
      width: 120px;
      height: 30px;
      background-color: #3182ce;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 0 5px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .graph-edge {
      position: absolute;
      height: 2px;
      background-color: #a0aec0;
      transform-origin: left center;
      z-index: -1;
    }
    .graph-edge::after {
      content: '';
      position: absolute;
      right: 0;
      top: -4px;
      border-style: solid;
      border-width: 5px 0 5px 8px;
      border-color: transparent transparent transparent #a0aec0;
    }
  `;
  document.head.appendChild(style);
}

// Call addGraphStyles on load
addGraphStyles();

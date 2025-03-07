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
  document.querySelectorAll(".directory-stat").forEach((stat) => {
    stat.addEventListener("click", function () {
      const directory = this.getAttribute("data-directory");
      if (directoryFilter) {
        directoryFilter.value = directory;

        // Switch to all dependencies tab
        document
          .querySelectorAll(".tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".tab-content")
          .forEach((c) => c.classList.remove("active"));
        document
          .querySelector('.tab[data-tab="all-deps"]')
          .classList.add("active");
        document.getElementById("all-deps-content").classList.add("active");

        filterDependencies();
      }
    });
  });

  // Generate graph visualizations
  generateGraphs();
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

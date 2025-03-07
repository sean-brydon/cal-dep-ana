// src/analyze-dependencies.js
const fs = require("fs");
const path = require("path");

// Directory to analyze
const repoDir = process.argv[2];
const outputFile = process.argv[3];
const maxFiles = parseInt(process.argv[4] || "0", 10);

console.log(`Starting dependency analysis of ${repoDir}`);
console.log(`Max files to analyze: ${maxFiles || "unlimited"}`);

// Get all JavaScript/TypeScript files
function getAllFiles(dir, fileList = []) {
  if (maxFiles > 0 && fileList.length >= maxFiles) {
    return fileList;
  }

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (maxFiles > 0 && fileList.length >= maxFiles) {
        break;
      }

      const filePath = path.join(dir, file);

      try {
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Skip node_modules, .git, and other common directories to ignore
          if (
            file !== "node_modules" &&
            file !== ".git" &&
            file !== "dist" &&
            file !== "build" &&
            file !== ".next" &&
            file !== "coverage"
          ) {
            getAllFiles(filePath, fileList);
          }
        } else {
          // Only include JS/TS files
          if (/\.(js|jsx|ts|tsx)$/.test(file) && !file.endsWith(".d.ts")) {
            fileList.push(filePath);
          }
        }
      } catch (err) {
        console.warn(`Error accessing ${filePath}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`Error reading directory ${dir}: ${err.message}`);
  }

  return fileList;
}

// Parse imports from a file
function parseImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const imports = [];

    // Match ES6 imports
    const es6ImportRegex = /import\s+(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Match require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  } catch (err) {
    console.warn(`Error reading file ${filePath}: ${err.message}`);
    return [];
  }
}

// Map file paths to normalized module paths
function createFilePathMap(files) {
  const filePathMap = {};

  files.forEach((file) => {
    const relativePath = path.relative(repoDir, file).replace(/\\/g, "/");
    filePathMap[relativePath] = file;

    // Also map without extension
    const withoutExt = relativePath.replace(/\.(js|jsx|ts|tsx)$/, "");
    if (withoutExt !== relativePath) {
      filePathMap[withoutExt] = file;
    }

    // Map index files to their directory
    if (
      relativePath.endsWith("/index.js") ||
      relativePath.endsWith("/index.jsx") ||
      relativePath.endsWith("/index.ts") ||
      relativePath.endsWith("/index.tsx")
    ) {
      const dirPath = relativePath.substring(0, relativePath.lastIndexOf("/"));
      filePathMap[dirPath] = file;
    }
  });

  return filePathMap;
}

// Resolve import path to actual file path
function resolveImport(importPath, currentFile, filePathMap) {
  // Handle relative imports
  if (importPath.startsWith(".")) {
    const currentDir = path.dirname(currentFile);
    const absolutePath = path
      .resolve(currentDir, importPath)
      .replace(/\\/g, "/");
    const relativePath = path
      .relative(repoDir, absolutePath)
      .replace(/\\/g, "/");

    // Check if we have an exact match
    if (filePathMap[relativePath]) {
      return filePathMap[relativePath];
    }

    // Try with extensions
    const extensions = [".js", ".jsx", ".ts", ".tsx"];
    for (const ext of extensions) {
      if (filePathMap[relativePath + ext]) {
        return filePathMap[relativePath + ext];
      }
    }

    // Try with /index
    const indexPath = relativePath + "/index";
    for (const ext of extensions) {
      if (filePathMap[indexPath + ext]) {
        return filePathMap[indexPath + ext];
      }
    }
  } else {
    // For non-relative imports, we'll try to match against our file map
    // This is a simplified approach and won't handle all cases

    // Try direct match (for monorepo packages)
    if (filePathMap[importPath]) {
      return filePathMap[importPath];
    }

    // Try common monorepo patterns
    const patterns = [
      `packages/${importPath}`,
      `apps/${importPath}`,
      `packages/${importPath}/index`,
      `apps/${importPath}/index`,
    ];

    for (const pattern of patterns) {
      if (filePathMap[pattern]) {
        return filePathMap[pattern];
      }

      // Try with extensions
      const extensions = [".js", ".jsx", ".ts", ".tsx"];
      for (const ext of extensions) {
        if (filePathMap[pattern + ext]) {
          return filePathMap[pattern + ext];
        }
      }
    }
  }

  return null;
}

// Build dependency graph
function buildDependencyGraph(files, filePathMap) {
  const graph = {};

  files.forEach((file) => {
    const relativePath = path.relative(repoDir, file).replace(/\\/g, "/");
    graph[relativePath] = [];

    const imports = parseImports(file);
    imports.forEach((importPath) => {
      const resolvedPath = resolveImport(importPath, file, filePathMap);
      if (resolvedPath) {
        const relativeImportPath = path
          .relative(repoDir, resolvedPath)
          .replace(/\\/g, "/");
        if (relativePath !== relativeImportPath) {
          // Avoid self-references
          graph[relativePath].push(relativeImportPath);
        }
      }
    });
  });

  return graph;
}

// Find circular dependencies using Tarjan's algorithm
function findCircularDependencies(graph) {
  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function dfs(node, path = []) {
    if (stack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart);
        cycle.push(node);
        cycles.push(cycle);
      }
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    stack.add(node);
    path.push(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path]);
    }

    stack.delete(node);
  }

  // Visit all nodes
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

// Main execution
console.log(`Analyzing dependencies in ${repoDir}...`);
const files = getAllFiles(repoDir);
console.log(`Found ${files.length} files to analyze`);

console.log("Creating file path map...");
const filePathMap = createFilePathMap(files);

console.log("Building dependency graph...");
const graph = buildDependencyGraph(files, filePathMap);

console.log("Finding circular dependencies...");
const circularDeps = findCircularDependencies(graph);

console.log(`Found ${circularDeps.length} circular dependencies`);

// Format for output
const formattedDeps = circularDeps.map((cycle, index) => {
  return {
    id: index + 1,
    files: cycle,
  };
});

// Write raw output in a format similar to skott
const rawOutput = `
 Running custom dependency analyzer

 Processed ${files.length} files

 ✖ (${circularDeps.length}) circular dependencies found

${formattedDeps
  .map(
    (dep, index) => `
 ${index + 1}. 

${dep.files.map((file) => ` -> ${file}`).join("\n")}
`
  )
  .join("\n")}
`;

fs.writeFileSync(outputFile, rawOutput);
console.log(`Raw output written to ${outputFile}`);

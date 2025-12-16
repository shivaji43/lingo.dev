import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";
import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Track active fixtures for cleanup
const activeFixtures = new Set<TestFixture>();

// Global cleanup handler
function setupGlobalCleanup() {
  let cleanupInProgress = false;

  const cleanup = async () => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;

    console.log("\n🧹 Cleaning up all test fixtures...");
    const fixtures = Array.from(activeFixtures);
    await Promise.all(
      fixtures.map((fixture) =>
        fixture.clean().catch((e) => console.error("Cleanup error:", e)),
      ),
    );
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("beforeExit", cleanup);
}

// Call once when module loads
setupGlobalCleanup();

// Helper to recursively copy directory
async function copyDir(
  src: string,
  dest: string,
  filter?: (src: string) => boolean,
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (filter && !filter(srcPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, filter);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// Helper to recursively remove directory
async function removeDir(dir: string): Promise<void> {
  if (!fsSync.existsSync(dir)) {
    return;
  }
  await fs.rm(dir, { recursive: true, force: true });
}

// Helper to kill process tree (cross-platform)
function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return;

  if (process.platform === "win32") {
    // Windows: use taskkill to kill process tree
    try {
      execAsync(`taskkill /pid ${proc.pid} /T /F`).catch(() => {
        // Process might already be dead
      });
    } catch (e) {
      // Ignore errors
    }
  } else {
    // Unix: kill process group
    try {
      process.kill(-proc.pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-proc.pid, "SIGKILL");
        } catch (e) {
          // Already dead
        }
      }, 2000);
    } catch (e) {
      // Fallback to killing just the process
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 2000);
    }
  }
}

// Helper to check if port is in use
async function isPortInUse(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}`);
    return true; // If we get any response, port is in use
  } catch (e: any) {
    // ECONNREFUSED means port is not in use
    if (e.code === "ECONNREFUSED") {
      return false;
    }
    // Other errors might mean port is in use but not responding
    return true;
  }
}

export type Framework = "next" | "vite";

export interface TestFixtureOptions {
  framework: Framework;
  config?: any;
  bundleInitialLocale?: boolean;
}

export interface DevServer {
  port: number;
  stop: () => Promise<void>;
  waitForReady: () => Promise<void>;
}

export interface ProdServer {
  port: number;
  stop: () => Promise<void>;
}

export interface TestFixture {
  framework: Framework;
  tempPath: string;
  path: (p: string) => string;
  startDev: () => Promise<DevServer>;
  build: () => Promise<string>;
  startProduction: () => Promise<ProdServer>;
  clean: () => Promise<void>;
  readMetadata: () => Promise<any>;
  updateFile: (
    filePath: string,
    updater: (content: string) => string,
  ) => Promise<void>;
  createFile: (filePath: string, content: string) => Promise<void>;
}

/**
 * Setup a test fixture by copying the prepared fixture
 * Prepared fixtures already have node_modules installed
 */
export async function setupFixture(
  options: TestFixtureOptions,
): Promise<TestFixture> {
  const { framework } = options;

  // Source: prepared fixture with dependencies already installed
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", framework);

  // Check if fixture exists
  if (!fsSync.existsSync(fixturePath)) {
    throw new Error(
      `Fixture for ${framework} not found. Run "pnpm test:prepare" first.`,
    );
  }

  // Destination: temp directory
  const tempPath = await fs.mkdtemp(
    path.join(os.tmpdir(), `lingo-test-${framework}-`),
  );

  console.log(
    `Setting up ${framework} test from prepared fixture at ${tempPath}`,
  );

  // Copy prepared fixture to temp directory (excluding node_modules and build artifacts)
  await copyDir(fixturePath, tempPath, (src: string) => {
    const name = path.basename(src);
    // Skip build artifacts and node_modules (we'll install fresh)
    return ![".next", "dist", ".lingo", ".turbo", "node_modules"].includes(
      name,
    );
  });

  // Update package.json to use local compiler instead of workspace reference
  console.log(`  Updating package.json to use local compiler...`);
  const packageJsonPath = path.join(tempPath, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
  // Use compiler root directory (contains package.json and build/)
  const compilerRoot = process.cwd();

  // Replace workspace:* with file: path
  // Using file: (not workspace:) prevents pnpm from detecting this as part of workspace
  if (packageJson.dependencies?.["@lingo.dev/compiler"]) {
    packageJson.dependencies["@lingo.dev/compiler"] = `file:${compilerRoot}`;
  }

  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // Install dependencies fresh in temp directory
  console.log(
    `  Installing dependencies for ${framework} in temp directory...`,
  );
  try {
    const result = await execAsync("pnpm install --no-frozen-lockfile", {
      cwd: tempPath,
      timeout: 120000,
      env: { ...process.env, CI: "true" },
    });
    console.log(`  ✅ Dependencies installed`);
  } catch (error: any) {
    console.error(`  ❌ Failed to install dependencies:`, error.message);
    if (error.stdout) console.error(`  stdout: ${error.stdout}`);
    if (error.stderr) console.error(`  stderr: ${error.stderr}`);
    throw error;
  }

  // Apply custom config if provided
  if (options.config) {
    await updateConfig(tempPath, framework, options.config);
  }

  const fixture: TestFixture = {
    framework,
    tempPath,
    path: (p: string) => path.join(tempPath, p),

    async startDev(): Promise<DevServer> {
      // Both Next.js and Vite are configured to use port 3000 in the demo apps
      const port = 3000;

      // Check if port is already in use
      // if (await isPortInUse(port)) {
      //   throw new Error(
      //     `Port ${port} is already in use. Please free it before starting dev server.`,
      //   );
      // }

      console.log(`Starting dev server for ${framework} on port ${port}...`);

      const isWindows = process.platform === "win32";
      const devProcess = spawn(isWindows ? "pnpm.cmd" : "pnpm", ["dev"], {
        cwd: tempPath,
        stdio: "pipe",
        shell: true,
        detached: !isWindows, // Use process groups on Unix
      });

      // Track if process errored during startup
      let startupError: Error | null = null;

      devProcess.on("error", (error) => {
        console.error(`[${framework} dev] Process error:`, error);
        startupError = error;
      });

      devProcess.on("exit", (code, signal) => {
        if (code !== 0 && code !== null) {
          console.error(`[${framework} dev] Process exited with code ${code}`);
        }
      });

      // Capture output for debugging
      devProcess.stdout?.on("data", (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[${framework} dev]: ${output}`);
        }
      });

      devProcess.stderr?.on("data", (data) => {
        const output = data.toString().trim();
        if (output) {
          console.error(`[${framework} dev error]: ${output}`);
        }
      });

      // Wait for server to be ready
      try {
        await waitForPort(port, 60000);
      } catch (error) {
        killProcessTree(devProcess);
        if (startupError) {
          throw new Error(
            `Dev server failed to start: ${startupError.message}`,
          );
        }
        throw error;
      }

      return {
        port,
        stop: async () => {
          console.log(`Stopping dev server for ${framework}...`);
          return new Promise<void>((resolve) => {
            devProcess.once("exit", () => {
              console.log(`Dev server stopped for ${framework}`);
              resolve();
            });

            killProcessTree(devProcess);

            // Force resolve after timeout
            setTimeout(() => {
              resolve();
            }, 5000);
          });
        },
        waitForReady: () => waitForPort(port),
      };
    },

    async build(): Promise<string> {
      console.log(`Building ${framework}...`);
      try {
        const result = await execAsync("pnpm build", {
          cwd: tempPath,
          timeout: 120000,
        });
        console.log(`✅ Build completed for ${framework}`);
        return result.stdout + result.stderr;
      } catch (error: any) {
        console.error(
          `❌ Build failed for ${framework}:`,
          error.stdout,
          error.stderr,
        );
        throw error;
      }
    },

    async startProduction(): Promise<ProdServer> {
      const port = framework === "next" ? 3000 : 4173;

      // Check if port is already in use
      if (await isPortInUse(port)) {
        throw new Error(
          `Port ${port} is already in use. Please free it before starting production server.`,
        );
      }

      console.log(
        `Starting production server for ${framework} on port ${port}...`,
      );

      const isWindows = process.platform === "win32";
      const prodProcess = spawn(isWindows ? "pnpm.cmd" : "pnpm", ["start"], {
        cwd: tempPath,
        stdio: "pipe",
        shell: true,
        detached: !isWindows,
      });

      let startupError: Error | null = null;

      prodProcess.on("error", (error) => {
        console.error(`[${framework} prod] Process error:`, error);
        startupError = error;
      });

      prodProcess.on("exit", (code, signal) => {
        if (code !== 0 && code !== null) {
          console.error(`[${framework} prod] Process exited with code ${code}`);
        }
      });

      // Capture output for debugging
      prodProcess.stdout?.on("data", (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[${framework} prod]: ${output}`);
        }
      });

      prodProcess.stderr?.on("data", (data) => {
        const output = data.toString().trim();
        if (output) {
          console.error(`[${framework} prod error]: ${output}`);
        }
      });

      try {
        await waitForPort(port, 60000);
      } catch (error) {
        killProcessTree(prodProcess);
        if (startupError) {
          throw new Error(
            `Production server failed to start: ${startupError.message}`,
          );
        }
        throw error;
      }

      return {
        port,
        stop: async () => {
          console.log(`Stopping production server for ${framework}...`);
          return new Promise<void>((resolve) => {
            prodProcess.once("exit", () => {
              console.log(`Production server stopped for ${framework}`);
              resolve();
            });

            killProcessTree(prodProcess);

            // Force resolve after timeout
            setTimeout(() => {
              resolve();
            }, 5000);
          });
        },
      };
    },

    async clean(): Promise<void> {
      console.log(`Cleaning up fixture at ${tempPath}...`);
      activeFixtures.delete(fixture);
      await removeDir(tempPath);
    },

    async readMetadata(): Promise<any> {
      const metadataPath = path.join(tempPath, ".lingo/metadata.json");
      const content = await fs.readFile(metadataPath, "utf-8");
      return JSON.parse(content);
    },

    async updateFile(
      filePath: string,
      updater: (content: string) => string,
    ): Promise<void> {
      const fullPath = path.join(tempPath, filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      await fs.writeFile(fullPath, updater(content));
    },

    async createFile(filePath: string, content: string): Promise<void> {
      const fullPath = path.join(tempPath, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    },
  };

  // Register for cleanup
  activeFixtures.add(fixture);

  return fixture;
}

async function waitForPort(port: number, timeout = 60000): Promise<void> {
  const startTime = Date.now();
  let lastError: Error | null = null;

  console.log(`Waiting for port ${port} to be ready...`);

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout per request
      });

      // Accept any response (200, 404, etc) as "ready"
      console.log(`✅ Port ${port} is ready (status: ${response.status})`);
      return;
    } catch (e: any) {
      lastError = e;
      // Only log occasionally to avoid spam
      if ((Date.now() - startTime) % 5000 < 500) {
        console.log(
          `  Still waiting for port ${port}... (${Math.floor((Date.now() - startTime) / 1000)}s)`,
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Port ${port} did not become available within ${timeout}ms. Last error: ${lastError?.message}`,
  );
}

async function updateConfig(
  tempPath: string,
  framework: Framework,
  config: any,
): Promise<void> {
  if (framework === "next") {
    const configPath = path.join(tempPath, "next.config.ts");
    // For now, just log that we would update the config
    console.log(`Would update Next.js config with:`, config);
    // TODO: Implement config merging
  } else {
    const configPath = path.join(tempPath, "vite.config.ts");
    console.log(`Would update Vite config with:`, config);
    // TODO: Implement config merging
  }
}

/**
 * Find the translation server port by checking common ports
 */
export async function findTranslationServerPort(): Promise<number | null> {
  // Translation server typically starts at port 60000 and increments
  for (let port = 60000; port < 60010; port++) {
    try {
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        return port;
      }
    } catch (e) {
      // Port not available
    }
  }
  return null;
}

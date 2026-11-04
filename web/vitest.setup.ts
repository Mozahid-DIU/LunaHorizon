import { afterEach } from "vitest";

/**
 * Many tests here run the engine for seconds at a time without pausing. Back to back, they can
 * keep a worker busy past Vitest's 60 s limit for reporting progress, which fails the run with
 * "Timeout calling onTaskUpdate" even though every test passed. A short pause after each test
 * lets those messages through.
 */
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

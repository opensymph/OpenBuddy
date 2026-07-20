// vitest 全局 setup:为每个测试注册 jest-dom matchers 与 DOM cleanup。
// testing-library v16 在检测到 vitest afterEach 时会自动 cleanup,
// 但显式导入确保跨版本一致。
import "@testing-library/jest-dom/vitest";

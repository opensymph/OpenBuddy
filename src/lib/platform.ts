/**
 * 平台检测(免依赖版)。
 *
 * 没有引入 @tauri-apps/plugin-os:Tauri 各平台的 webview UA 已足够区分桌面
 * 三大平台 —— WKWebView (macOS) 的 UA 必含 "Macintosh",WebView2 含
 * "Windows",Linux WebKitGTK 含 "Linux"。浏览器预览模式下同样生效。
 *
 * 用途:macOS 使用系统原生 Overlay 标题栏(红绿灯 + 原生菜单栏),需要
 * 隐藏自定义 TitleBar 并为红绿灯预留安全区;Windows/Linux 保持自绘标题栏。
 */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /macintosh|mac os x/i.test(navigator.userAgent);
}

/** 模块级常量:运行期平台不会变化,避免重复解析。 */
export const IS_MACOS = isMacOS();

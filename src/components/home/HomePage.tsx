import { useState } from "react";
import { SceneTabs } from "./SceneTabs";
import { PracticeCases } from "./PracticeCases";
import { HomeHeader } from "./HomeHeader";
import { HomeComposer } from "./HomeComposer";
import type { HomeModeId } from "../home-scenes";

export function HomePage() {
  const [activeMode, setActiveMode] = useState<HomeModeId>("working");

  const handleSelectTemplate = (prompt: string) => {
    console.log("Selected template:", prompt);
    // 在实际项目中，这里会调用 Composer 的 onSend 或通过 zustand 存储触发
  };

  const handleSend = (text: string) => {
    console.log("Send:", text);
    // WIP 页面的占位实现：真正的发送逻辑在 src/components/HomePage.tsx。
  };

  return (
    <div className="wb-home-page">
      <HomeHeader />

      {/* === SceneTabs - 精确对齐 WorkBuddy === */}
      <SceneTabs activeMode={activeMode} onChange={setActiveMode} />

      <HomeComposer onSend={handleSend} />

      {/* === PracticeCases - 精确对齐 WorkBuddy === */}
      <PracticeCases 
        activeMode={activeMode}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}
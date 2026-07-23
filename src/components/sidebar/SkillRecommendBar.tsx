/**
 * 技能推荐栏 — 显示当前可用的技能（从 grok skills_list 获取）。
 *
 * 对齐 WorkBuddy 的 skill-recommend-bar：
 *  - 从后端拉取真实技能列表（不再硬编码）
 *  - 点击技能 → 插入 `/skillName` 到输入框
 *  - 按 scope 分组显示（local / user / bundled / plugin）
 */
import { useCallback, useEffect, useState } from "react";
import { Code2, Search, FileText, Bot, Layers, Zap } from "lucide-react";
import { skillsList } from "@/lib/grok-client";
import type { SkillInfo } from "@/lib/types";

/** Map skill scope to an icon + color for visual variety. */
const SCOPE_STYLE: Record<string, { icon: typeof Code2; color: string }> = {
  local: { icon: Code2, color: "#3b82f6" },
  repo: { icon: Search, color: "#8b5cf6" },
  user: { icon: FileText, color: "#ec4899" },
  server: { icon: Bot, color: "#10b981" },
  bundled: { icon: Zap, color: "#f59e0b" },
  plugin: { icon: Layers, color: "#6366f1" },
};

const DEFAULT_STYLE = { icon: Zap, color: "#6366f1" };

interface SkillRecommendBarProps {
  cwd?: string;
  /** Called when user clicks a skill chip — parent inserts `/name` into composer. */
  onSelectSkill?: (skillName: string) => void;
}

export function SkillRecommendBar({ cwd, onSelectSkill }: SkillRecommendBarProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await skillsList(cwd);
      // Only show user-invocable + enabled skills.
      setSkills(list.filter((s) => s.enabled && s.userInvocable !== false));
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="skill-recommend-bar">
        <div className="skill-recommend-bar__header">
          <span className="skill-recommend-bar__title">技能推荐</span>
        </div>
        <div className="skill-recommend-bar__loading">加载中…</div>
      </div>
    );
  }

  if (skills.length === 0) return null;

  // Show at most 6 skills to keep the bar compact.
  const shown = skills.slice(0, 6);

  return (
    <div className="skill-recommend-bar">
      <div className="skill-recommend-bar__header">
        <span className="skill-recommend-bar__title">技能推荐</span>
        {skills.length > 6 && (
          <span className="skill-recommend-bar__count">+{skills.length - 6}</span>
        )}
      </div>
      <div className="skill-recommend-bar__grid">
        {shown.map((skill) => {
          const style = SCOPE_STYLE[skill.scope ?? ""] ?? DEFAULT_STYLE;
          const Icon = style.icon;
          return (
            <button
              key={skill.name}
              className="skill-chip"
              style={{ borderLeft: `4px solid ${style.color}` }}
              onClick={() => onSelectSkill?.(skill.name)}
              title={skill.description ?? skill.name}
            >
              <Icon size={18} color={style.color} />
              <span className="skill-chip__title">
                {skill.displayName ?? skill.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

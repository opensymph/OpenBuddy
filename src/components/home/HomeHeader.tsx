import { useState } from "react";
import { Menu, Search, Bell, User } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export function HomeHeader() {
  const [searchOpen, setSearchOpen] = useState(false);

  const handleOpenSettings = () => {
    openDialog({
      title: "设置",
      defaultPath: "",
      directory: true,
      canCreateDirectories: true,
    }).then((path) => {
      if (path) {
        console.log("打开工作目录:", path);
      }
    });
  };

  return (
    <header className="home-header">
      <div className="home-header__left">
        <button className="home-header__menu-btn" aria-label="菜单">
          <Menu size={24} />
        </button>
        
        <div className="home-header__logo">
          <span className="home-header__logo-text">OpenBuddy</span>
        </div>
      </div>

      <div className="home-header__center">
        <div className={`home-header__search ${searchOpen ? "open" : ""}`}>
          <button 
            className="home-header__search-trigger"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={18} />
            <span>搜索会话或技能...</span>
          </button>
        </div>
      </div>

      <div className="home-header__right">
        <button className="home-header__action-btn" aria-label="通知">
          <Bell size={20} />
        </button>
        
        <button className="home-header__action-btn" aria-label="用户">
          <User size={20} />
        </button>

        <button 
          className="home-header__action-btn home-header__directory-btn"
          onClick={handleOpenSettings}
          title="切换工作目录"
        >
          📁
        </button>
      </div>
    </header>
  );
}
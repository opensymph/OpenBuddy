// OpenBuddy Tauri backend library entry point.
//
// Spawns the in-process grok agent (grok::spawn_grok), wires the ACP stream
// to Tauri events (bridge::spawn_dispatcher), and registers the command
// table (commands) that the React frontend invokes.

mod agents_store;
mod automations;
mod bridge;
mod commands;
mod experts;
mod ext;
mod grok;
mod grok_admin;
mod mcp;
mod meta;
mod notifications;
mod permission_config;
mod providers;
mod sessions;
mod shell_fs;
mod skills;

use bridge::{Permissions, Questions};
use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging for debugging
    let _ = tracing_subscriber::fmt::try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .manage(Permissions::new())
        .manage(Questions::new())
        .invoke_handler(tauri::generate_handler![
            // session lifecycle
            commands::grok_init,
            commands::grok_auth_status,
            commands::grok_new_session,
            commands::grok_load_session,
            commands::grok_list_sessions,
            commands::grok_set_model,
            commands::grok_list_workspaces,
            commands::grok_send,
            commands::grok_cancel,
            commands::grok_resolve_permission,
            commands::grok_resolve_question,
            commands::grok_rename_session,
            commands::grok_delete_session,
            commands::grok_set_session_pinned,
            commands::grok_set_session_archived,
            // BYOK providers (~/.grok/config.toml [model.*])
            providers::providers_list,
            providers::providers_save,
            providers::providers_delete,
            // default permission rules (~/.grok/config.toml [permission])
            permission_config::permission_list,
            permission_config::permission_save,
            // permission mode (~/.grok/config.toml [ui].permission_mode + live notify)
            permission_config::permission_mode_get,
            permission_config::permission_mode_set,
            // agent/assistant defaults (~/.grok/config.toml [models].default + [ui].default_selected_permission)
            permission_config::agents_defaults_get,
            permission_config::agents_defaults_save,
            // skills (x.ai/skills/*)
            skills::skills_list,
            skills::skills_add,
            skills::skills_remove,
            skills::skills_toggle,
            // connectors / MCP (x.ai/mcp/*)
            mcp::mcp_list,
            mcp::mcp_upsert,
            mcp::mcp_delete,
            mcp::mcp_toggle,
            mcp::mcp_config_path,
            mcp::mcp_config_read,
            mcp::mcp_config_save,
            // experts / assistants (~/.grok/agents/*.md)
            agents_store::agents_list,
            agents_store::agents_get,
            agents_store::agents_save,
            agents_store::agents_delete,
            agents_store::agents_template,
            // expert marketplace (live from a local WorkBuddy data dir)
            experts::experts_default_root,
            experts::experts_list_roots,
            experts::experts_load,
            experts::experts_thumbnail,
            experts::experts_image_bytes,
            // grok admin: memory / search / rewind / commands / plan / tasks / reload
            grok_admin::memory_list,
            grok_admin::memory_get,
            grok_admin::memory_save,
            grok_admin::memory_delete,
            grok_admin::memory_rewrite,
            grok_admin::memory_flush,
            grok_admin::session_search,
            grok_admin::rewind_points,
            grok_admin::rewind_execute,
            grok_admin::session_fork,
            grok_admin::commands_list,
            grok_admin::prompt_history,
            grok_admin::tasks_list,
            grok_admin::task_kill,
            grok_admin::folder_trust_respond,
            grok_admin::toggle_plan_mode,
            grok_admin::internal_reload,
            grok_admin::inspiration_generate,
            grok_admin::account_info,
            grok_admin::account_check_subscription,
            grok_admin::account_logout,
            grok_admin::account_get_api_key,
            grok_admin::account_set_api_key,
            grok_admin::account_get_auth_url,
            grok_admin::account_cancel_auth,
            grok_admin::plugins_list,
            grok_admin::plugins_action,
            grok_admin::marketplace_list,
            grok_admin::marketplace_action,
            // notification log (智能体邮箱 → 会话通知中心)
            notifications::notification_append,
            notifications::notification_list,
            notifications::notification_mark_read,
            notifications::notification_mark_all_read,
            notifications::notification_clear,
            // automations (local scheduler)
            automations::automations_snapshot,
            automations::automations_save,
            automations::automations_delete,
            automations::automations_set_status,
            automations::automations_run,
            automations::automation_records_archive,
            automations::automation_records_delete,
            // shell / filesystem (markdown links, path click, apply write)
            shell_fs::open_url,
            shell_fs::open_path,
            shell_fs::reveal_in_folder,
            shell_fs::path_stat,
            shell_fs::read_text_file,
            shell_fs::write_text_file,
            shell_fs::browse_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenBuddy");
}

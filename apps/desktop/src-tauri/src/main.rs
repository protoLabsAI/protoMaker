// Ava Desktop — Tauri v2 wrapper for protoLabs Studio chat.
//
// - Global hotkey (Cmd+Shift+A / Ctrl+Shift+A) toggles window visibility
// - System tray with Show/Hide and Quit
// - Closing the window hides it (app stays in tray)
// - Always-on-top for quick access

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Register global shortcut plugin with handler — only once
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ── System Tray ──────────────────────────────────────────
            let show_hide = MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Ava", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Ava")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show_hide" => toggle_window(app),
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // ── Register Cmd+Shift+A hotkey ───────────────────────────
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyA);
            app.global_shortcut().register(shortcut)?;

            Ok(())
        })
        // ── Hide on close instead of quitting ────────────────────────
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Ava desktop");
}

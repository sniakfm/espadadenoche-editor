// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn get_config_path() -> PathBuf {
    if let Ok(exe_dir) = std::env::current_exe() {
        if let Some(parent) = exe_dir.parent() {
            let direct = parent.join("EditorData/base_config.json");
            if direct.exists() {
                return direct;
            }
            let parent_data = parent.join("../EditorData/base_config.json");
            if parent_data.exists() {
                return parent_data;
            }
            return direct;
        }
    }

    let p1 = PathBuf::from("EditorData/base_config.json");
    if p1.exists() {
        return p1;
    }
    let p2 = PathBuf::from("../EditorData/base_config.json");
    if p2.exists() {
        return p2;
    }

    PathBuf::from("EditorData/base_config.json")
}

#[tauri::command]
fn get_base_config() -> Result<serde_json::Value, String> {
    let cfg_path = get_config_path();
    if cfg_path.exists() {
        let content = fs::read_to_string(&cfg_path).map_err(|e| e.to_string())?;
        let val: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(val)
    } else {
        Ok(serde_json::json!({
            "DBPath": {
                "AbilityEdit": null,
                "MonsterEdit": null,
                "WeaponEdit": null,
                "MapEdit": null,
                "MapTileEdit": null
            }
        }))
    }
}

#[tauri::command]
fn update_db_path(editor_key: String, path: Option<String>) -> Result<(), String> {
    let cfg_path = get_config_path();
    if let Some(parent) = cfg_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut config: serde_json::Value = if cfg_path.exists() {
        let content = fs::read_to_string(&cfg_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({ "DBPath": {} }))
    } else {
        serde_json::json!({ "DBPath": {} })
    };

    if !config.get("DBPath").map_or(false, |v| v.is_object()) {
        config["DBPath"] = serde_json::json!({});
    }

    config["DBPath"][&editor_key] = match path {
        Some(p) => serde_json::Value::String(p),
        None => serde_json::Value::Null,
    };

    let json_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&cfg_path, json_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("파일 읽기 오류 ({}): {}", path, e))
}

#[tauri::command]
fn write_file_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| format!("파일 쓰기 오류 ({}): {}", path, e))
}

#[tauri::command]
fn open_file_dialog(filter_ext: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new();

    if let Some(ref ext) = filter_ext {
        if ext == "json" {
            dialog = dialog.add_filter("JSON Files (*.json)", &["json"]);
        } else if ext == "csv" {
            dialog = dialog.add_filter("CSV Files (*.csv)", &["csv"]);
        }
    }

    if let Some(path) = dialog.pick_file() {
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_file_dialog(default_name: String, content: String) -> Result<String, String> {
    let mut dialog = rfd::FileDialog::new().set_file_name(&default_name);

    if default_name.ends_with(".json") {
        dialog = dialog.add_filter("JSON Files (*.json)", &["json"]);
    } else if default_name.ends_with(".csv") {
        dialog = dialog.add_filter("CSV Files (*.csv)", &["csv"]);
    }

    if let Some(path) = dialog.save_file() {
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().to_string())
    } else {
        Ok(String::new()) // User canceled
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", &url])
            .creation_flags(0x08000000)
            .spawn();
    }
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_file_dialog,
            get_base_config,
            update_db_path,
            read_file_text,
            write_file_text,
            open_file_dialog,
            open_external_url
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // When window close is requested, cleanly terminate the entire process
                let _ = window.app_handle().exit(0);
                std::process::exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            std::process::exit(0);
        }
    });
}

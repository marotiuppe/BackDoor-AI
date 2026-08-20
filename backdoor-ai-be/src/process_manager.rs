use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::HANDLE;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarState {
    pub qdrant_port: u16,
    pub backend_ready: bool,
}

pub struct ProcessManager {
    pub state: Arc<Mutex<SidecarState>>,
    pub qdrant_grpc_port: u16,
    _qdrant_child: Option<Child>,
    _ollama_child: Option<Child>,
    #[cfg(target_os = "windows")]
    _job_handle: Option<HANDLE>,
}

impl ProcessManager {
    pub fn new(qdrant_port: u16, qdrant_grpc_port: u16) -> Self {
        Self {
            state: Arc::new(Mutex::new(SidecarState {
                qdrant_port,
                backend_ready: true, // Rust backend is instantly ready!
            })),
            qdrant_grpc_port,
            _qdrant_child: None,
            _ollama_child: None,
            #[cfg(target_os = "windows")]
            _job_handle: None,
        }
    }

    pub fn launch_sidecars(&mut self) -> Result<(), String> {
        let state_guard = self.state.lock().unwrap();
        let qdrant_port = state_guard.qdrant_port;
        drop(state_guard);

        println!("[ProcessManager] Launching sidecars: QdrantPort={}", qdrant_port);

        // 1. Terminate any conflicting Ollama instances (system tray or other standalone servers)
        #[cfg(target_os = "windows")]
        {
            println!("[ProcessManager] Stopping existing running instances of Ollama to free port 11434...");
            let _ = Command::new("taskkill")
                .args(&["/F", "/IM", "ollama.exe"])
                .output();
            let _ = Command::new("taskkill")
                .args(&["/F", "/IM", "ollama_app.exe"])
                .output();
            // Let the socket release
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        // Create a single shared Windows Job Object for both sidecars
        #[cfg(target_os = "windows")]
        let mut shared_job: Option<HANDLE> = None;
        #[cfg(target_os = "windows")]
        if let Ok(Some(h)) = create_windows_job_object() {
            shared_job = Some(h);
            self._job_handle = Some(h);
        }

        // Resolve qdrant.exe binary path dynamically
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| std::path::PathBuf::from("."));

        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        let app_dir = std::path::PathBuf::from(&local_app_data).join("com.backdoor.desktop");
        let app_dir_qdrant = app_dir.join("qdrant.exe");
        let app_dir_nested_qdrant = app_dir.join("qdrant").join("qdrant.exe");

        // If qdrant.exe is missing, try to find and extract the zip file automatically
        if !app_dir_qdrant.exists() && !app_dir_nested_qdrant.exists() {
            let zip_candidates = vec![
                exe_dir.join("qdrant-x86_64-pc-windows-msvc.zip"),
                exe_dir.join("resources").join("qdrant-x86_64-pc-windows-msvc.zip"),
                exe_dir.join("resources").join("tools").join("qdrant-x86_64-pc-windows-msvc.zip"),
                exe_dir.join("tools").join("qdrant-x86_64-pc-windows-msvc.zip"),
                exe_dir.join("tools").join("qdrant").join("qdrant-x86_64-pc-windows-msvc.zip"),
                std::path::PathBuf::from("qdrant-x86_64-pc-windows-msvc.zip"),
                std::path::PathBuf::from("tools/qdrant-x86_64-pc-windows-msvc.zip"),
                std::path::PathBuf::from("tools/qdrant/qdrant-x86_64-pc-windows-msvc.zip"),
                std::path::PathBuf::from("../tools/qdrant-x86_64-pc-windows-msvc.zip"),
                std::path::PathBuf::from("../tools/qdrant/qdrant-x86_64-pc-windows-msvc.zip"),
            ];

            if let Some(zip_path) = zip_candidates.into_iter().find(|p| p.exists()) {
                println!("[ProcessManager] Found Qdrant archive at {:?}. Auto-extracting to AppData...", zip_path);
                let _ = std::fs::create_dir_all(&app_dir);
                // Windows has native tar.exe built-in since Win10 build 17063. We use it to unzip without external dependencies.
                let extract_status = Command::new("tar")
                    .arg("-xf")
                    .arg(&zip_path)
                    .arg("-C")
                    .arg(&app_dir)
                    .output();
                match extract_status {
                    Ok(out) => {
                        if out.status.success() {
                            println!("[ProcessManager] Auto-extraction successful.");
                        } else {
                            println!("[ProcessManager] tar extraction failed: {}", String::from_utf8_lossy(&out.stderr));
                        }
                    }
                    Err(e) => {
                        println!("[ProcessManager] Failed to launch tar utility: {}", e);
                    }
                }
            }
        }

        let candidate_paths = vec![
            app_dir_qdrant,
            app_dir_nested_qdrant,
            exe_dir.join("qdrant.exe"),
            exe_dir.join("tools").join("qdrant.exe"),
            exe_dir.join("tools").join("qdrant").join("qdrant.exe"),
            std::path::PathBuf::from("qdrant.exe"),
            std::path::PathBuf::from("tools/qdrant.exe"),
            std::path::PathBuf::from("tools/qdrant/qdrant.exe"),
            std::path::PathBuf::from("../tools/qdrant.exe"),
            std::path::PathBuf::from("../tools/qdrant/qdrant.exe"),
        ];

        let qdrant_binary = candidate_paths
            .into_iter()
            .find(|p| p.exists())
            .unwrap_or_else(|| std::path::PathBuf::from("qdrant.exe"));

        let log_dir = app_dir.join("logs");
        let _ = std::fs::create_dir_all(&log_dir);

        let qdrant_log_file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(log_dir.join("qdrant.log"));

        let mut qdrant_cmd_builder = Command::new(&qdrant_binary);
        qdrant_cmd_builder
            .current_dir(&app_dir)
            .env("QDRANT__SERVICE__HTTP_PORT", qdrant_port.to_string())
            .env("QDRANT__SERVICE__GRPC_PORT", self.qdrant_grpc_port.to_string());

        if let Ok(file) = qdrant_log_file {
            if let Ok(err_file) = file.try_clone() {
                qdrant_cmd_builder.stdout(std::process::Stdio::from(file));
                qdrant_cmd_builder.stderr(std::process::Stdio::from(err_file));
            }
        }

        #[cfg(target_os = "windows")]
        qdrant_cmd_builder.creation_flags(0x08000000);

        let qdrant_cmd = qdrant_cmd_builder.spawn();

        match qdrant_cmd {
            Ok(child) => {
                println!("[ProcessManager] Spawned qdrant.exe sidecar ({:?}) with PID {}", qdrant_binary, child.id());
                #[cfg(target_os = "windows")]
                if let Some(h) = shared_job {
                    assign_process_to_job(h, child.id());
                }
                self._qdrant_child = Some(child);
            }
            Err(e) => {
                println!("[ProcessManager] Notice: qdrant.exe not found or failed to launch at {:?}: {}. Skipping vector sidecar for now.", qdrant_binary, e);
            }
        }

        // Try to spawn 'ollama serve' as a background process to ensure Ollama runs
        let ollama_log_file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(log_dir.join("ollama.log"));

        let mut ollama_cmd_builder = Command::new("ollama");
        ollama_cmd_builder.arg("serve");

        if let Ok(file) = ollama_log_file {
            if let Ok(err_file) = file.try_clone() {
                ollama_cmd_builder.stdout(std::process::Stdio::from(file));
                ollama_cmd_builder.stderr(std::process::Stdio::from(err_file));
            }
        } else {
            ollama_cmd_builder.stdout(std::process::Stdio::null());
            ollama_cmd_builder.stderr(std::process::Stdio::null());
        }

        #[cfg(target_os = "windows")]
        ollama_cmd_builder.creation_flags(0x08000000);

        let ollama_cmd = ollama_cmd_builder.spawn();

        match ollama_cmd {
            Ok(child) => {
                println!("[ProcessManager] Spawned 'ollama serve' with PID {}", child.id());
                #[cfg(target_os = "windows")]
                if let Some(h) = shared_job {
                    assign_process_to_job(h, child.id());
                }
                self._ollama_child = Some(child);
            }
            Err(e) => {
                println!("[ProcessManager] Notice: 'ollama' command not found or failed to launch: {}. Assuming user will start it manually or it is already running.", e);
            }
        }

        Ok(())
    }
}

impl Drop for ProcessManager {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::Foundation::CloseHandle;
            if let Some(h) = self._job_handle {
                let _ = CloseHandle(h);
            }
        }
        println!("[ProcessManager] Cleaned up sidecar processes and closed Job Object.");
    }
}

#[cfg(target_os = "windows")]
fn create_windows_job_object() -> Result<Option<HANDLE>, String> {
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job == 0 {
            return Err("CreateJobObjectW failed".into());
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        
        let success = SetInformationJobObject(
            job,
            9, // JobObjectExtendedLimitInformation
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if success == 0 {
            return Err("SetInformationJobObject failed".into());
        }
        Ok(Some(job))
    }
}

#[cfg(target_os = "windows")]
fn assign_process_to_job(job: HANDLE, pid: u32) {
    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};
        let process_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if process_handle != 0 {
            let _ = AssignProcessToJobObject(job, process_handle);
            CloseHandle(process_handle);
        }
    }
}

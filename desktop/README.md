# Ujo desktop shell

This Tauri 2 shell packages the same authenticated web client for Windows, macOS and Linux. Install Rust and the Tauri prerequisites, then run `npx tauri dev --config desktop/src-tauri/tauri.conf.json`. The desktop app does not contain hub secrets and connects through the same direct-hub or Vercel gateway modes as the mobile/web client.

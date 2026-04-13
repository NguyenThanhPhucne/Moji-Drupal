#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/android-kotlin"
APP_COMPONENT="${MOJI_APP_COMPONENT:-com.moji.mobile.debug/com.moji.mobile.MainActivity}"
DEFAULT_AVD="${MOJI_AVD:-Pixel_10_Pro_XL}"

resolve_sdk_dir() {
  local candidates=()
  [[ -n "${ANDROID_SDK_ROOT:-}" ]] && candidates+=("$ANDROID_SDK_ROOT")
  [[ -n "${ANDROID_HOME:-}" ]] && candidates+=("$ANDROID_HOME")
  candidates+=("$HOME/Library/Android/sdk")

  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "Android SDK not found. Set ANDROID_SDK_ROOT or install SDK at ~/Library/Android/sdk" >&2
  exit 1
}

SDK_DIR="$(resolve_sdk_dir)"
ADB="$SDK_DIR/platform-tools/adb"
EMULATOR="$SDK_DIR/emulator/emulator"

require_tools() {
  [[ -x "$ADB" ]] || {
    echo "adb not found at $ADB" >&2
    exit 1
  }
  [[ -x "$EMULATOR" ]] || {
    echo "emulator not found at $EMULATOR" >&2
    exit 1
  }
}

resolve_avd_name() {
  local requested="$DEFAULT_AVD"
  local avds
  avds="$($EMULATOR -list-avds)"

  if [[ -z "$avds" ]]; then
    echo "No AVD found. Create one in Android Studio > Device Manager." >&2
    exit 1
  fi

  if grep -Fxq "$requested" <<<"$avds"; then
    printf '%s\n' "$requested"
    return 0
  fi

  printf '%s\n' "$(head -n 1 <<<"$avds")"
}

AVD_NAME="$(resolve_avd_name)"

print_help() {
  cat <<EOF
Moji Android helper

Usage:
  $(basename "$0") up       Start emulator if needed
  $(basename "$0") run      Start emulator, install debug APK, launch app
  $(basename "$0") install  Install debug APK only
  $(basename "$0") launch   Launch app only
  $(basename "$0") reset    Recover from offline emulator/adb
  $(basename "$0") status   Show adb and AVD status

Config overrides:
  MOJI_AVD=YourAvdName
  MOJI_APP_COMPONENT=package/activity
EOF
}

status_cmd() {
  echo "SDK: $SDK_DIR"
  echo "AVD: $AVD_NAME"
  "$ADB" start-server >/dev/null
  "$ADB" devices -l
}

up_cmd() {
  "$ADB" start-server >/dev/null

  if "$ADB" devices | grep -Eq '^emulator-[0-9]+[[:space:]]+device$'; then
    echo "Emulator already online."
    return 0
  fi

  echo "Starting emulator: $AVD_NAME"
  nohup "$EMULATOR" -avd "$AVD_NAME" -no-snapshot-load >"${TMPDIR:-/tmp}/moji-android-emulator.log" 2>&1 &
  disown || true
  echo "Emulator is launching in background..."
}

wait_ready_cmd() {
  "$ADB" wait-for-device
  "$ADB" shell 'while [ "$(getprop sys.boot_completed | tr -d "\r")" != "1" ]; do sleep 1; done' >/dev/null
  echo "Device ready."
}

install_cmd() {
  (cd "$ANDROID_DIR" && ./gradlew :app:installDebug)
}

launch_cmd() {
  "$ADB" shell am start -n "$APP_COMPONENT"
}

reset_cmd() {
  "$ADB" start-server >/dev/null || true

  while read -r serial state _; do
    if [[ "$serial" =~ ^emulator-[0-9]+$ ]]; then
      "$ADB" -s "$serial" emu kill >/dev/null 2>&1 || true
    fi
  done < <("$ADB" devices | sed '1d')

  pkill -f "emulator.*$AVD_NAME" >/dev/null 2>&1 || true
  pkill -f 'qemu-system-aarch64-headless' >/dev/null 2>&1 || true

  "$ADB" kill-server >/dev/null 2>&1 || true
  "$ADB" start-server >/dev/null
  echo "ADB/emulator reset done."
}

run_cmd() {
  if "$ADB" devices | grep -Eq '^emulator-[0-9]+[[:space:]]+offline$'; then
    echo "Offline emulator detected. Recovering..."
    reset_cmd
  fi

  up_cmd
  wait_ready_cmd
  install_cmd
  launch_cmd
}

main() {
  require_tools

  local cmd="${1:-help}"
  case "$cmd" in
    up)
      up_cmd
      ;;
    run)
      run_cmd
      ;;
    install)
      install_cmd
      ;;
    launch)
      launch_cmd
      ;;
    reset)
      reset_cmd
      ;;
    status)
      status_cmd
      ;;
    help|-h|--help)
      print_help
      ;;
    *)
      echo "Unknown command: $cmd" >&2
      print_help
      exit 1
      ;;
  esac
}

main "$@"

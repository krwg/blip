!include "nsDialogs.nsh"

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to BLIP Setup"
  !define MUI_WELCOMEPAGE_TEXT "BLIP is a LAN-only P2P messenger — text, voice, video, and mesh files.$\r$\n$\r$\n• No cloud, no accounts, no mandatory internet$\r$\n• Same Wi‑Fi / Hamachi / Radmin / Tailscale mesh$\r$\n• Publisher: krwg · License: GNU GPL v3$\r$\n$\r$\nBefore install: allow UDP 42069 / TCP 42070 on private networks; one BLIP copy per PC (ports cannot be shared).$\r$\n$\r$\nClick Next to choose install mode and folder."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "BLIP is ready"
  !define MUI_FINISHPAGE_TEXT "Setup finished.$\r$\n$\r$\n• Start BLIP and pick a free BLIP ID (1–64)$\r$\n• Open UDP 42069 / TCP 42070 if peers stay invisible$\r$\n• Portable builds do not use this Setup — use the *-Portable.exe instead$\r$\n$\r$\nDocs: https://krwg.github.io/blip/"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch BLIP now"
  !define MUI_FINISHPAGE_LINK "Open BLIP site"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://krwg.github.io/blip/"

  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Remove BLIP"
  !define MUI_WELCOMEPAGE_TEXT "This wizard uninstalls BLIP from this computer.$\r$\n$\r$\nChat history and settings live under your Windows user profile (AppData). You can optionally delete that data on the components page."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInstallSection
  Section /o "un.Remove BLIP settings and chat data"
    RMDir /r "$APPDATA\BLIP"
    RMDir /r "$LOCALAPPDATA\BLIP"
  SectionEnd
!macroend

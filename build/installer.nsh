!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
Var CeramiApiKeyInput
Var CeramiApiKeyValue

; Custom page shown after the install-directory page and before files are
; copied: the client enters the license API key (activation code) issued by
; the central platform. It is REQUIRED — the app never asks for it again.
!macro customPageAfterChangeDir
  Page custom CeramiSysApiKeyPage CeramiSysApiKeyPageLeave
!macroend

Function CeramiSysApiKeyPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == "error"
    Abort
  ${EndIf}

  ${NSD_CreateLabel} $0 0 0 100% 24u "أدخل كود التفعيل (API Key) الخاص بترخيص البرنامج — مطلوب، وهو الطريقة الوحيدة لإدخاله."
  Pop $0
  ${NSD_CreateText} $0 0 36u 100% 12u ""
  Pop $CeramiApiKeyInput
  ${NSD_SetText} $CeramiApiKeyInput "$CeramiApiKeyValue"

  nsDialogs::Show
FunctionEnd

Function CeramiSysApiKeyPageLeave
  ${NSD_GetText} $CeramiApiKeyInput $1
  ; The API key is collected ONLY on this installer page — it cannot be
  ; entered later inside the app, so an empty value must not pass.
  StrCmp $1 "" ceramiApiKeyMissing
  ; The key is embedded verbatim into pending-activation.json — reject
  ; characters that would break the JSON string.
  StrStr $1 '"' $3
  StrCmp $3 "" ceramiApiKeyCheckBackslash
  Goto ceramiApiKeyBadChars
  ceramiApiKeyCheckBackslash:
  StrStr $1 '\' $3
  StrCmp $3 "" ceramiApiKeyCheckCr
  Goto ceramiApiKeyBadChars
  ceramiApiKeyCheckCr:
  StrStr $1 "$\r" $3
  StrCmp $3 "" ceramiApiKeyCheckLf
  Goto ceramiApiKeyBadChars
  ceramiApiKeyCheckLf:
  StrStr $1 "$\n" $3
  StrCmp $3 "" ceramiApiKeyOk
  ceramiApiKeyBadChars:
    MessageBox MB_OK|MB_ICONEXCLAMATION "كود التفعيل يحتوي على رموز غير مسموحة — أدخل الكود كما صدر دون أي إضافات."
    Abort
  ceramiApiKeyOk:
    StrCpy $CeramiApiKeyValue $1
    Return
  ceramiApiKeyMissing:
    MessageBox MB_OK|MB_ICONEXCLAMATION "كود التفعيل (API Key) مطلوب ولا يمكن تركه فارغًا."
    Abort
FunctionEnd
!endif

; Persist the entered key next to the executable; the app reads it once on
; first run and deletes it after a successful activation.
!macro customInstall
  StrCmp $CeramiApiKeyValue "" ceramiSkipApiKeyWrite
    FileOpen $0 "$INSTDIR\pending-activation.json" w
    FileWrite $0 '{"schemaVersion":1,"apiKey":"$CeramiApiKeyValue"}'
    FileClose $0
  ceramiSkipApiKeyWrite:
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION \
        "هل تريد حذف بيانات الشركات والنسخ الاحتياطية والإعدادات المحلية؟ لا يمكن التراجع عن هذا الإجراء. اختر «لا» للاحتفاظ بالبيانات." \
        IDNO keepUserData
      RMDir /r "$APPDATA\CeramiSysERP"
      Goto userDataHandled
      keepUserData:
      DetailPrint "تم الاحتفاظ ببيانات المستخدم."
      userDataHandled:
    ${EndIf}
  ${EndIf}
!macroend

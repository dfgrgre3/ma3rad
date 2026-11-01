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

const CLOSE_TIMEOUT_MS = 3500;

function waitForRendererSave({ win, ipcMain, validateIpcSender, timeoutMs, requestId }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ipcMain.removeListener('app:close-ready', onCloseReady);
      resolve(result);
    };
    const onCloseReady = (event, result) => {
      if (event.sender !== win.webContents) return;
      try {
        validateIpcSender(event);
      } catch (error) {
        console.error('Rejected app close confirmation:', error);
        return;
      }
      if (result?.requestId !== requestId) return;
      if (result?.ok === true) {
        finish({ ok: true });
      } else {
        finish({
          ok: false,
          error: typeof result?.error === 'string' && result.error
            ? result.error
            : 'لم تؤكد الواجهة اكتمال حفظ قاعدة البيانات.',
        });
      }
    };
    const timeout = setTimeout(() => {
      finish({ ok: false, error: 'انتهت مهلة انتظار تأكيد حفظ قاعدة البيانات.' });
    }, timeoutMs);

    ipcMain.on('app:close-ready', onCloseReady);
    try {
      win.webContents.send('app:before-close', { requestId });
    } catch (error) {
      finish({
        ok: false,
        error: `تعذر بدء حفظ قاعدة البيانات: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
}

function installGracefulClose({
  win,
  ipcMain,
  dialog,
  validateIpcSender,
  timeoutMs = CLOSE_TIMEOUT_MS,
  onApprovedClose = () => {},
  onCancelledClose = () => {},
}) {
  let closeApproved = false;
  let closeFlowRunning = false;
  let nextRequestId = 0;

  const onClose = (event) => {
    if (closeApproved) return;
    event.preventDefault();
    if (closeFlowRunning) return;

    closeFlowRunning = true;
    void (async () => {
      while (!win.isDestroyed()) {
        const requestId = ++nextRequestId;
        const result = await waitForRendererSave({
          win, ipcMain, validateIpcSender, timeoutMs, requestId,
        });
        if (result.ok) {
          closeApproved = true;
          closeFlowRunning = false;
          onApprovedClose();
          win.close();
          return;
        }

        const choice = await dialog.showMessageBox(win, {
          type: 'warning',
          title: 'تعذر حفظ التغييرات',
          message: 'لم يتم تأكيد حفظ آخر تغييرات قاعدة البيانات.',
          detail: `${result.error}\n\nإغلاق التطبيق الآن بالقوة قد يؤدي إلى فقدان التغييرات غير المحفوظة.`,
          buttons: ['إعادة المحاولة', 'إلغاء الإغلاق', 'إغلاق قسري'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });

        if (choice.response === 0) continue;
        if (choice.response === 2 && !win.isDestroyed()) {
          closeApproved = true;
          closeFlowRunning = false;
          onApprovedClose();
          win.destroy();
          return;
        }

        onCancelledClose();
        closeFlowRunning = false;
        return;
      }
      closeFlowRunning = false;
    })().catch((error) => {
      console.error('Graceful shutdown error:', error);
      onCancelledClose();
      closeFlowRunning = false;
    });
  };

  win.on('close', onClose);
}

module.exports = { installGracefulClose };

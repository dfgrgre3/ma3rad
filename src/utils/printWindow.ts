export function writeAndPrintWindow(
  printWindow: Window,
  html: string,
  closeAfterPrint = false,
): void {
  let printed = false;
  const startPrint = () => {
    if (printed || printWindow.closed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
    if (closeAfterPrint) {
      setTimeout(() => {
        if (!printWindow.closed) printWindow.close();
      }, 500);
    }
  };

  printWindow.addEventListener('load', startPrint, { once: true });
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(startPrint, 1000);
}

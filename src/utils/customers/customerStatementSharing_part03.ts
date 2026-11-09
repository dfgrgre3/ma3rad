import { buildExportHtml, downloadPdf } from '../export/export';
import { buildWhatsAppUrl, openExternalShare } from '../shared/externalLinks';
import { getCustomerStatementExportOptions } from './customerStatementSharing_part01';
import type { CustomerStatement } from './customerStatementSharing_part01';
import { buildCustomerStatementWhatsAppMessage } from './customerStatementSharing_part02';

export async function shareCustomerStatementOnWhatsApp(statement: CustomerStatement): Promise<void> {
  let whatsappOpened = false;
  try {
    const options = getCustomerStatementExportOptions(statement);
    const html = buildExportHtml(options);
    const message = buildCustomerStatementWhatsAppMessage(statement);
    const encodedMessage = encodeURIComponent(message);
    const longMessage = encodedMessage.length > 5000;
    const phone = String(statement.customer.phone || '').replace(/[^0-9]/g, '');
    whatsappOpened = openExternalShare(
      buildWhatsAppUrl(phone, longMessage ? '' : encodedMessage),
      message,
    );

    let messageCopied = false;
    if (whatsappOpened && longMessage) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          messageCopied = true;
        } catch (error) {
          console.error('Failed to copy the full customer statement message:', error);
        }
      }
      if (!messageCopied) {
        messageCopied = window.prompt('انسخ نص كشف الحساب الكامل من النافذة وألصقه في محادثة واتساب:', message) !== null;
      }
    }

    const pdfSaved = await downloadPdf(html, options.fileName);
    if (!pdfSaved) {
      if (whatsappOpened) {
        window.alert('تم فتح واتساب، لكن لم يتم حفظ PDF. احفظ الكشف من المعاينة ثم أرفقه في المحادثة.');
      }
      return;
    }
    if (whatsappOpened) {
      const nextStep = longMessage
        ? messageCopied
          ? 'انقل نص الكشف الكامل من نافذة النسخ إلى محادثة واتساب، وأرفق الملف قبل الإرسال.'
          : 'تعذر إدخال نص الكشف الطويل؛ أرسل ملف PDF أو أعد المشاركة.'
        : 'أرفق الملف في محادثة واتساب قبل الإرسال.';
      window.alert(window.ceramisys?.savePdf
        ? `تم حفظ ملف PDF. ${nextStep}`
        : `اختر «حفظ كـ PDF» من نافذة الطباعة، ثم ${nextStep}`);
    }
  } catch (error) {
    console.error('Failed to prepare customer statement PDF:', error);
    window.alert(whatsappOpened
      ? 'تم فتح واتساب، لكن تعذر تجهيز PDF. يمكنك معاينة كشف الحساب وتنزيله ثم إرفاقه يدويًا.'
      : 'تعذر تجهيز كشف الحساب للمشاركة. تحقق من صلاحيات التصدير ثم أعد المحاولة.');
  }
}

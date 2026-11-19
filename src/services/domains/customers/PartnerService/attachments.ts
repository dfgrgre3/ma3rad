import type { PartnerAttachment } from './types';

export function isPartnerAttachment(value: unknown): value is PartnerAttachment {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as Record<string, unknown>;
  return typeof attachment.name === 'string'
    && typeof attachment.type === 'string'
    && typeof attachment.dataUrl === 'string';
}

export function validateAttachments(attachments: PartnerAttachment[]): PartnerAttachment[] {
  if (attachments.length > 3) throw new Error('يمكن إرفاق 3 ملفات كحد أقصى لكل حركة.');
  return attachments.map((attachment) => {
    const name = String(attachment.name || '').trim();
    const type = String(attachment.type || '').toLowerCase();
    if (!name || !['application/pdf', 'image/jpeg', 'image/png'].includes(type)) {
      throw new Error('المرفقات المسموحة هي PDF أو JPG أو PNG فقط.');
    }
    if (!/^data:(application\/pdf|image\/jpeg|image\/png);base64,[A-Za-z0-9+/=]+$/.test(attachment.dataUrl)
      || !attachment.dataUrl.startsWith(`data:${type};base64,`)
      || attachment.dataUrl.length > 2_800_000) {
      throw new Error('حجم المرفق يجب ألا يتجاوز 2 ميجابايت.');
    }
    return { name, type, dataUrl: attachment.dataUrl };
  });
}

export function parseAttachments(value: string | undefined): PartnerAttachment[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isPartnerAttachment)) {
      throw new Error('بيانات المرفقات غير صحيحة.');
    }
    return validateAttachments(parsed);
  } catch (error) {
    throw new Error('تعذر قراءة مرفقات حركة الشريك.', { cause: error });
  }
}

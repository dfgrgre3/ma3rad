import React from 'react';
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type {
  PlatformPlan,
  PlatformTenant,
  PlatformTenantInput,
  PlatformTenantStatus,
} from '../../../services/domains/platform/platformTypes';
import { useToast } from '../../../components/ui/Toast';
import { STATUSES } from './constants';

interface UseCsvImportOptions {
  plans: PlatformPlan[];
  centralActive: boolean;
  load: () => void;
}

/** Minimal RFC-4180-ish CSV line parser (handles quotes and escaped quotes). */
const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      if (inQuotes && line[j + 1] === '"') { current += '"'; j++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim()); current = '';
    } else current += char;
  }
  values.push(current.trim());
  return values;
};

const stripBom = (content: string): string => content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

const ALLOWED_STATUSES = new Set<string>(STATUSES);

export function useCsvImport({ plans, centralActive, load }: UseCsvImportOptions) {
  const toast = useToast();

  const [csvImportOpen, setCsvImportOpen] = React.useState(false);
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [csvPreview, setCsvPreview] = React.useState<string[][]>([]);
  const [csvImporting, setCsvImporting] = React.useState(false);

  const handleCsvFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = stripBom((e.target?.result as string) ?? '');
      const lines = content.trim().split('\n');
      const preview = lines.slice(0, 5).map(parseCsvLine);
      setCsvPreview(preview);
    };
    reader.readAsText(file, 'utf-8');
  };

  const executeCsvImport = async () => {
    if (!csvFile) { toast.error('اختر ملف CSV'); return; }
    setCsvImporting(true);
    try {
      const content = stripBom(await csvFile.text());
      if (centralActive) {
        const headerMap: Record<string, string> = {
          name: 'name', 'الاسم': 'name', tenantname: 'name',
          code: 'code', 'الكود': 'code', tenantcode: 'code',
          contactname: 'contactName', 'جهة الاتصال': 'contactName', contact: 'contactName',
          email: 'email', 'البريد': 'email', phone: 'phone', 'الهاتف': 'phone', mobile: 'phone',
          country: 'country', 'الدولة': 'country', city: 'city', 'المدينة': 'city',
          address: 'address', 'العنوان': 'address', businesstype: 'businessType', 'نوع النشاط': 'businessType',
          status: 'status', 'الحالة': 'status', planid: 'planId', plan: 'planId', 'الباقة': 'planId',
          seatslimit: 'seatsLimit', 'seats': 'seatsLimit', brancheslimit: 'branchesLimit', branches: 'branchesLimit',
          deviceslimit: 'devicesLimit', devices: 'devicesLimit', notes: 'notes', 'ملاحظات': 'notes',
        };
        const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const resolvedHeaders = lines.length > 0 ? parseCsvLine(lines[0]).map((h) => headerMap[h.trim().toLowerCase()] ?? null) : [];
        // Fetch the tenant directory once and match rows in memory (avoids N+1 API calls).
        const existingTenants: PlatformTenant[] = await centralPlatformClient.listTenants();
        const findExisting = (input: PlatformTenantInput): PlatformTenant | undefined =>
          existingTenants.find((t) =>
            (input.email && t.email === input.email) ||
            (input.code && t.code === input.code) ||
            t.name === input.name);
        let created = 0;
        let updated = 0;
        const errors: Array<{ row: number; error: string }> = [];
        for (let i = 1; i < lines.length; i++) {
          const rowNumber = i + 1;
          try {
            const values = parseCsvLine(lines[i]);
            const input: Record<string, string | number> = { name: '' };
            values.forEach((value, index) => {
              const field = resolvedHeaders[index];
              if (!field || value === '') return;
              input[field] = value;
            });
            if (!String(input.name ?? '').trim()) throw new Error('اسم العميل مطلوب');
            const tenantInput: PlatformTenantInput = {
              name: String(input.name).trim(),
              code: input.code ? String(input.code).trim() : undefined,
              contactName: input.contactName ? String(input.contactName) : undefined,
              email: input.email ? String(input.email) : undefined,
              phone: input.phone ? String(input.phone) : undefined,
              country: input.country ? String(input.country) : undefined,
              city: input.city ? String(input.city) : undefined,
              address: input.address ? String(input.address) : undefined,
              businessType: input.businessType ? String(input.businessType) : undefined,
              notes: input.notes ? String(input.notes) : undefined,
            };
            if (input.status !== undefined && input.status !== '') {
              const statusValue = String(input.status).trim().toUpperCase();
              if (!ALLOWED_STATUSES.has(statusValue)) {
                throw new Error(`حالة غير صالحة: ${statusValue} (المسموح: ${STATUSES.join('، ')})`);
              }
              tenantInput.status = statusValue as PlatformTenantStatus;
            }
            if (input.planId !== undefined && input.planId !== '') {
              const planValue = String(input.planId).trim();
              const plan = plans.find((p) => p.code === planValue || p.id === planValue || p.name === planValue);
              if (!plan) throw new Error(`باقة غير معروفة: ${planValue}`);
              tenantInput.planId = plan.id;
            }
            for (const field of ['seatsLimit', 'branchesLimit', 'devicesLimit'] as const) {
              const raw = input[field];
              if (raw === undefined || raw === '') continue;
              const num = Number(raw);
              if (!Number.isFinite(num) || num < 0) throw new Error(`قيمة غير صالحة للحقل ${field}: ${raw}`);
              tenantInput[field] = Math.floor(num);
            }
            const existing = findExisting(tenantInput);
            if (existing) {
              await centralPlatformClient.updateTenant(existing.id, { ...tenantInput } as Record<string, any>);
              updated += 1;
            } else {
              await centralPlatformClient.createTenant(tenantInput);
              created += 1;
            }
          } catch (err) {
            errors.push({ row: rowNumber, error: err instanceof Error ? err.message : 'فشل' });
          }
        }
        toast.success('اكتمل الاستيراد', `مُنشأ: ${created}، مُحدّث: ${updated}، أخطاء: ${errors.length}`);
        errors.forEach((e) => toast.error(`السطر ${e.row}`, e.error));
      } else {
        const result = platformAdminService.importTenantsCsv(content, { skipHeader: true });
        toast.success('اكتمل الاستيراد', `مُنشأ: ${result.created}، مُحدّث: ${result.updated}، أخطاء: ${result.errors.length}`);
        if (result.errors.length > 0) {
          result.errors.forEach(e => toast.error(`السطر ${e.row}`, e.error));
        }
      }
      setCsvImportOpen(false);
      setCsvFile(null);
      setCsvPreview([]);
      load();
    } catch (err) {
      toast.error('فشل الاستيراد', err instanceof Error ? err.message : undefined);
    } finally {
      setCsvImporting(false);
    }
  };

  return {
    csvImportOpen,
    setCsvImportOpen,
    csvFile,
    setCsvFile,
    csvPreview,
    setCsvPreview,
    csvImporting,
    handleCsvFileSelect,
    executeCsvImport,
  };
}

export type CsvImportState = ReturnType<typeof useCsvImport>;

import React from 'react';
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type { PlatformPlan } from '../../../services/domains/platform/platformTypes';
import { useToast } from '../../../components/ui/Toast';

interface UseCsvImportOptions {
  plans: PlatformPlan[];
  centralActive: boolean;
  load: () => void;
}

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
      const content = e.target?.result as string;
      const lines = content.trim().split('\n');
      const preview = lines.slice(0, 5).map(line => {
        // Simple CSV parse
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
      });
      setCsvPreview(preview);
    };
    reader.readAsText(file, 'utf-8');
  };

  const executeCsvImport = async () => {
    if (!csvFile) { toast.error('اختر ملف CSV'); return; }
    setCsvImporting(true);
    try {
      const content = await csvFile.text();
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
        const parseLine = (line: string): string[] => {
          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              if (inQuotes && line[j + 1] === '"') { current += '"'; j++; } else inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else current += char;
          }
          values.push(current.trim());
          return values;
        };
        const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const resolvedHeaders = lines.length > 0 ? parseLine(lines[0]).map((h) => headerMap[h.trim().toLowerCase()] ?? null) : [];
        let created = 0;
        let updated = 0;
        const errors: Array<{ row: number; error: string }> = [];
        for (let i = 1; i < lines.length; i++) {
          const rowNumber = i + 1;
          try {
            const values = parseLine(lines[i]);
            const input: Record<string, any> = { name: '' };
            values.forEach((value, index) => {
              const field = resolvedHeaders[index];
              if (!field || value === '') return;
              if (field === 'planId') {
                const plan = plans.find((p: any) => p.code === value || p.id === value || p.name === value);
                input.planId = plan?.id ?? value;
              } else if (field === 'status') {
                input.status = value.toUpperCase();
              } else if (field === 'seatsLimit' || field === 'branchesLimit' || field === 'devicesLimit') {
                const num = Number(value);
                if (!Number.isNaN(num)) input[field] = num;
              } else {
                input[field] = value;
              }
            });
            if (!input.name) throw new Error('اسم العميل مطلوب');
            const key = input.code || input.email || input.name;
            const existing = (await centralPlatformClient.listTenants(key)).find((t: any) =>
              (input.email && t.email === input.email) || (input.code && t.code === input.code) || t.name === input.name);
            if (existing) {
              await centralPlatformClient.updateTenant(existing.id, input);
              updated += 1;
            } else {
              await centralPlatformClient.createTenant(input as any);
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

import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { SettingsService } from '../../../services/domains/config/SettingsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { CompanyService } from '../../../services/domains/organization/CompanyService';
import { BranchService } from '../../../services/domains/organization/BranchService';
import { BUSINESS_TYPES, parseBusinessConfiguration, serializeBusinessConfiguration } from '../../../config/businessProfiles';
import { validateModuleSelection } from '../../../config/moduleRegistry';
import { ModuleRegistryService } from '../../../services/domains/config/ModuleRegistryService';
import { BusinessProfileService } from '../../../services/domains/config/BusinessProfileService';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { ConfigurationVersionService } from '../../../services/domains/config/ConfigurationVersionService';
import { auditLogger } from '../../../services/domains/security/auditLogger';
import { SETUP_DRAFT_KEY } from './setupConstants';
import { readDefaultAdminState } from './adminSecurity';
import type { useToast } from '../../ui/Toast';
import type {
  BusinessConfiguration,
  DefaultAdminState,
  SetupForm,
  SetupOptions,
  SetupSystemChecks,
  SetupWizardProps,
} from './setupTypes';
import type { Dispatch, SetStateAction } from 'react';

interface FinishSetupArgs {
  toast: ReturnType<typeof useToast>;
  systemChecks: SetupSystemChecks;
  options: SetupOptions;
  form: SetupForm;
  businessConfig: BusinessConfiguration;
  security: DefaultAdminState;
  setSecurity: Dispatch<SetStateAction<DefaultAdminState>>;
  adminProfileError: string | null;
  passwordPolicyError: string | null;
  passwordValid: boolean;
  currencySymbol: string;
  newPassword: string;
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  onComplete: SetupWizardProps['onComplete'];
}

export async function finishSetup({
  toast,
  systemChecks,
  options,
  form,
  businessConfig,
  security,
  setSecurity,
  adminProfileError,
  passwordPolicyError,
  passwordValid,
  currencySymbol,
  newPassword,
  step,
  setStep,
  setSaving,
  onComplete,
}: FinishSetupArgs): Promise<void> {
  if (systemChecks.database.state !== 'ready') {
    setStep(0);
    toast.error('لم يكتمل فحص قاعدة البيانات', systemChecks.database.detail);
    return;
  }
  if (systemChecks.storage.state === 'error') {
    setStep(0);
    toast.error('تعذر التحقق من التخزين المحلي', systemChecks.storage.detail);
    return;
  }
  if (options.company && form.showroomName.trim().length < 2) {
    setStep(0);
    toast.error('اسم المعرض مطلوب (حرفان على الأقل)');
    return;
  }
  if (options.branch && (form.branchName.trim().length < 2 || form.warehouseName.trim().length < 2)) {
    setStep(1);
    toast.error('اسم الفرع والمخزن مطلوب (حرفان على الأقل لكل منهما)');
    return;
  }
  if (options.modules && form.businessType === 'custom' && form.businessTypeLabel.trim().length < 2) {
    setStep(2);
    toast.error('اكتب اسم النشاط التجاري (حرفان على الأقل)');
    return;
  }
  const savedBusinessType = getEffectiveBusinessType();
  const savedBusinessConfig = parseBusinessConfiguration(
    SettingsService.getValue('businessProfileConfig'),
    savedBusinessType,
  );
  const businessTypeToSave = options.modules ? form.businessType : savedBusinessType;
  const businessConfigToSave = options.modules || options.inventory
    ? {
      ...(options.modules ? businessConfig : savedBusinessConfig),
      trackInventory: options.inventory ? businessConfig.trackInventory : savedBusinessConfig.trackInventory,
      businessType: businessTypeToSave,
    }
    : savedBusinessConfig;
  const taxPercentage = Number(form.taxPercentage);
  const fiscalYearStartMonth = Number(form.fiscalYearStartMonth);
  const lowStockThreshold = Number(form.lowStockThreshold);
  const discountThreshold = Number(form.discountThreshold);
  const invalidAccounting = options.accounting && (
    !Number.isFinite(taxPercentage) || taxPercentage < 0 || taxPercentage > 100
    || !Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12
    || !Number.isFinite(discountThreshold) || discountThreshold < 0 || discountThreshold > 100
  );
  const invalidInventory = options.inventory
    && (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0);
  if (invalidAccounting || invalidInventory) {
    setStep(3);
    toast.error('راجع شهر بداية السنة المالية ونسبة الضريبة وحدود المخزون والخصم');
    return;
  }
  const activeSecurity = readDefaultAdminState();
  if (activeSecurity.required !== security.required) setSecurity(activeSecurity);
  if (activeSecurity.error) {
    setSecurity(activeSecurity);
    setStep(3);
    toast.error('تعذر التحقق من حساب المدير', activeSecurity.error);
    return;
  }
  const requiresPassword = activeSecurity.required;
  if (requiresPassword && adminProfileError) {
    setStep(3);
    toast.error('راجع بيانات حساب المدير', adminProfileError);
    return;
  }
  if (requiresPassword && !passwordValid) {
    setStep(3);
    setSecurity(activeSecurity);
    toast.error('راجع كلمة المرور', passwordPolicyError || 'أدخل كلمة مرور جديدة وتأكيدًا مطابقًا.');
    return;
  }
  if (options.modules && businessConfig.units.length + businessConfig.customUnits.length === 0) {
    setStep(2);
    toast.error('اختر وحدة قياس واحدة على الأقل قبل المتابعة');
    return;
  }
  const moduleValidation = options.modules
    ? validateModuleSelection(form.enabledModules, { trackInventory: businessConfigToSave.trackInventory })
    : null;
  if (moduleValidation && moduleValidation.errors.length > 0) {
    setStep(2);
    toast.error('راجع الوحدات المفعّلة', moduleValidation.errors.join(' '));
    return;
  }
  const expectedShowroomName = options.company
    ? form.showroomName.trim()
    : SettingsService.getValue('showroomName') || '';
  setSaving(true);
  let db: DatabaseManager | null = null;
  let completionMarkerAttempted = false;
  let updatedAdmin: ReturnType<typeof AuthService.getCurrentUser> = null;
  try {
    const setupDatabase = DatabaseManager.getInstance();
    db = setupDatabase;
    const branchId = SettingsService.getValue('defaultBranchId') || 'br_main';
    const branch = setupDatabase.query<{ id: string; companyId: string }>(
      'SELECT id, company_id AS companyId FROM branches WHERE id = ? AND is_active = 1 LIMIT 1',
      [branchId]
    )[0] || setupDatabase.query<{ id: string; companyId: string }>(
      'SELECT id, company_id AS companyId FROM branches WHERE is_main = 1 AND is_active = 1 LIMIT 1'
    )[0];
    if (!branch?.companyId) throw new Error('تعذر العثور على الشركة والفرع الافتراضيين. تحقق من بيانات النظام ثم أعد المحاولة.');
    const companyExists = setupDatabase.query<{ id: string }>(
      'SELECT id FROM companies WHERE id = ? AND is_active = 1',
      [branch.companyId]
    )[0];
    if (!companyExists) throw new Error('الشركة المرتبطة بالفرع الافتراضي غير موجودة أو غير مفعلة.');
    const warehouse = setupDatabase.query<{ id: string }>(
      'SELECT id FROM warehouses WHERE branch_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1',
      [branch.id]
    )[0];
    if (!warehouse) throw new Error('تعذر العثور على المخزن الافتراضي للفرع. أعد تهيئة قاعدة البيانات قبل المتابعة.');

    setupDatabase.executeTransaction(() => {
      if (requiresPassword) {
        updatedAdmin = new AuthService().completeFirstRunAdminSetup(activeSecurity.userId, {
          username: options.users ? form.adminUsername : activeSecurity.username,
          fullName: options.users ? form.adminFullName : activeSecurity.fullName,
          phone: options.users ? form.adminPhone : activeSecurity.phone,
          password: newPassword,
        });
      }

      SettingsService.update({
        ...(options.company ? {
          showroomName: form.showroomName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          taxNumber: form.taxNumber.trim(),
          commercialRecord: form.commercialRecord.trim(),
          currency: form.currency,
          currencySymbol,
        } : {}),
        ...(options.modules ? {
          businessType: form.businessType,
          businessTypeLabel: form.businessType === 'custom'
          ? form.businessTypeLabel.trim()
          : BUSINESS_TYPES.find((type) => type.id === form.businessType)?.label || '',
        } : {}),
        ...(options.modules || options.inventory ? {
          businessProfileConfig: serializeBusinessConfiguration(businessConfigToSave),
        } : {}),
        ...(options.accounting ? {
          defaultTaxPercentage: taxPercentage,
          isTaxInclusive: form.isTaxInclusive,
          discountApprovalThresholdPercent: discountThreshold,
        } : {}),
        ...(options.inventory ? {
          enableNegativeStock: form.enableNegativeStock,
          costingMethod: form.costingMethod,
          lowStockAlertThresholdM2: lowStockThreshold,
        } : {}),
        defaultBranchId: branch.id,
      });
      if (options.company || options.accounting) {
        new CompanyService().updateCompany(branch.companyId, {
          ...(options.company ? {
            name: form.showroomName.trim(),
            legalName: form.legalName.trim() || form.showroomName.trim(),
            taxNumber: form.taxNumber.trim(),
            commercialRecord: form.commercialRecord.trim(),
            currency: form.currency,
          } : {}),
          ...(options.accounting ? { fiscalYearStartMonth } : {}),
        });
      }
      if (options.branch) {
        new BranchService().updateBranch(branch.id, {
          name: form.branchName.trim(),
          address: form.branchAddress.trim(),
          phone: form.branchPhone.trim(),
          companyId: branch.companyId,
          isDefault: true,
        });
        setupDatabase.run(
          'UPDATE warehouses SET name = ?, location = ? WHERE id = ?',
          [form.warehouseName.trim(), form.warehouseLocation.trim() || null, warehouse.id]
        );
      }
      if (options.modules && moduleValidation) {
        ModuleRegistryService.setEnabledModules(moduleValidation.enabled, AuthService.getCurrentUser(), 'إعداد أولي');
        BusinessProfileService.applyFromSettings();
        BusinessProfileService.applyPermissionsFromSettings();
      }
    });

    if (updatedAdmin) AuthService.setCurrentUser(updatedAdmin);
    await setupDatabase.flush();
    const firstSaveStatus = setupDatabase.getPersistenceStatus();
    if (firstSaveStatus.status !== 'saved' && firstSaveStatus.status !== 'unencrypted') {
      throw new Error(firstSaveStatus.error || 'لم يتم تأكيد حفظ إعدادات المنشأة على وسيط التخزين.');
    }
    if (SettingsService.getValue('businessType') !== businessTypeToSave
      || SettingsService.getValue('showroomName') !== expectedShowroomName) {
      throw new Error('تعذر التحقق من إعدادات النشاط بعد حفظها. لم يتم إنهاء الإعداد.');
    }

    completionMarkerAttempted = true;
    setupDatabase.run(
      `INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`
    );
    setupDatabase.run('DELETE FROM system_settings WHERE key = ?', [SETUP_DRAFT_KEY]);
    await setupDatabase.flush();
    const finalSaveStatus = setupDatabase.getPersistenceStatus();
    if (finalSaveStatus.status !== 'saved' && finalSaveStatus.status !== 'unencrypted') {
      throw new Error(finalSaveStatus.error || 'تعذر حفظ حالة اكتمال الإعداد.');
    }
    if (SettingsService.getValue('setup_completed') !== '1') {
      throw new Error('تعذر التحقق من تسجيل اكتمال الإعداد.');
    }
    ConfigurationVersionService.recordCurrent('الإعداد الأولي', AuthService.getCurrentUser());
    auditLogger.log(
      AuthService.getCurrentUser()?.id || 'system',
      'first-run-setup',
      'client-setup-completed',
      'company',
      branch.companyId,
      'اكتملت تهيئة المنشأة الجديدة',
      {
        configuredSections: Object.entries(options)
          .filter(([, enabled]) => enabled)
          .map(([section]) => section),
        skippedSections: Object.entries(options)
          .filter(([, enabled]) => !enabled)
          .map(([section]) => section),
        dataImport: 'deferred',
      },
      true,
      undefined,
      'medium',
    );
    toast.success('تم إعداد النظام بنجاح، مرحبًا بك في CeramiSys');
    onComplete(updatedAdmin ?? undefined);
  } catch (e: any) {
    let message = e?.message || 'تعذر حفظ إعدادات النظام';
    if (db && completionMarkerAttempted) {
      try {
        db.run('DELETE FROM system_settings WHERE key = ?', ['setup_completed']);
        db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
          SETUP_DRAFT_KEY,
          JSON.stringify({ version: 1, step, form, businessConfig, options }),
        ]);
        await db.flush();
      } catch (rollbackError) {
        console.error('Could not restore the resumable setup state:', rollbackError);
        const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        message = `${message} كما تعذر حفظ حالة الإعداد غير المكتمل: ${detail}`;
      }
    }
    toast.error(message);
  } finally {
    setSaving(false);
  }
}

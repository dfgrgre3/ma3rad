import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SettingsService } from '../../services/domains/config/SettingsService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { useToast } from '../ui/Toast';
import {
  BUSINESS_TYPES,
  getActivityModuleIds,
  getDefaultBusinessConfiguration,
  getProfileModuleIds,
  parseBusinessConfiguration,
} from '../../config/businessProfiles';
import { withModuleDependencies } from '../../config/moduleRegistry';
import { getEffectiveBusinessType } from '../../services/domains/config/BusinessTypeService';
import { CURRENCIES, DEFAULT_SETUP_OPTIONS, STEPS } from './SetupWizard/setupConstants';
import { finishSetup } from './SetupWizard/finishSetup';
import { readSetupDraft } from './SetupWizard/setupPersistence';
import { readDefaultAdminState } from './SetupWizard/adminSecurity';
import { buildInitialForm } from './SetupWizard/initialForm';
import { useSystemChecks } from './SetupWizard/useSystemChecks';
import { useSetupDraftSaver } from './SetupWizard/useSetupDraftSaver';
import { SetupWizardHeader } from './SetupWizard/SetupWizardHeader';
import { SetupWizardFooter } from './SetupWizard/SetupWizardFooter';
import { CompanyStep } from './SetupWizard/steps/CompanyStep';
import { BranchStep } from './SetupWizard/steps/BranchStep';
import { ActivityStep } from './SetupWizard/steps/ActivityStep';
import { AccountingStep } from './SetupWizard/steps/AccountingStep';
import { ReviewStep } from './SetupWizard/steps/ReviewStep';
import type {
  BusinessConfiguration,
  DefaultAdminState,
  SetupForm,
  SetupOptionControlRenderer,
  SetupOptions,
  SetupWizardProps,
  SystemCheckResult,
} from './SetupWizard/setupTypes';

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const toast = useToast();
  const bodyRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const [draft] = useState(readSetupDraft);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [step, setStep] = useState(() => draft?.step ?? 0);
  const [options, setOptions] = useState<SetupOptions>(() => draft?.options ?? DEFAULT_SETUP_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [security, setSecurity] = useState<DefaultAdminState>(readDefaultAdminState);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFamily, setActivityFamily] = useState('all');
  const [systemCheckAttempt, setSystemCheckAttempt] = useState(0);
  const systemChecks = useSystemChecks(systemCheckAttempt);
  const [form, setForm] = useState<SetupForm>(() => buildInitialForm(draft, security));
  const [businessConfig, setBusinessConfig] = useState<BusinessConfiguration>(() => {
    const businessType = form.businessType || getEffectiveBusinessType();
    const savedConfig = draft?.businessConfig
      ? JSON.stringify(draft.businessConfig)
      : SettingsService.getValue('businessProfileConfig');
    return parseBusinessConfiguration(savedConfig, businessType);
  });

  useSetupDraftSaver({ saving, step, form, businessConfig, options, setDraftSaveError });

  const currencySymbol = useMemo(
    () => CURRENCIES.find((c) => c.code === form.currency)?.symbol || form.currencySymbol,
    [form.currency, form.currencySymbol]
  );
  const visibleBusinessTypes = useMemo(() => {
    const query = activitySearch.trim().toLocaleLowerCase('ar');
    return BUSINESS_TYPES.filter((type) =>
      (activityFamily === 'all' || type.category === activityFamily)
      && (!query
        || type.label.toLocaleLowerCase('ar').includes(query)
        || type.description.toLocaleLowerCase('ar').includes(query)
        || type.familyLabel.toLocaleLowerCase('ar').includes(query))
    );
  }, [activityFamily, activitySearch]);

  const set = (key: keyof SetupForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const toggleSetupOption = (key: keyof SetupOptions) =>
    setOptions((current) => ({ ...current, [key]: !current[key] }));

  const selectBusinessType = (businessType: string) => {
    if (businessType === form.businessType) return;
    setForm((prev) => ({
      ...prev,
      businessType,
      enabledModules: getProfileModuleIds(businessType),
    }));
    const defaults = getDefaultBusinessConfiguration(businessType);
    setBusinessConfig(options.inventory
      ? defaults
      : { ...defaults, trackInventory: businessConfig.trackInventory });
  };

  const toggleAdditionalActivity = (activityId: string, enabled: boolean) => {
    const additionalActivityIds = enabled
      ? [...new Set([...businessConfig.additionalActivityIds, activityId])]
      : businessConfig.additionalActivityIds.filter((id) => id !== activityId);
    const defaults = getDefaultBusinessConfiguration(form.businessType, additionalActivityIds);
    setBusinessConfig((current) => ({
      ...defaults,
      businessModel: current.businessModel === 'mixed' || defaults.businessModel === 'mixed'
        ? 'mixed'
        : current.businessModel,
      trackInventory: options.inventory
        ? current.trackInventory || defaults.trackInventory
        : current.trackInventory,
      units: [...new Set([...current.units, ...defaults.units])],
      customUnits: [...new Set([...current.customUnits, ...defaults.customUnits])],
      productAttributes: [...new Set([...current.productAttributes, ...defaults.productAttributes])],
    }));
    if (enabled) {
      setForm((current) => ({
        ...current,
        enabledModules: [...new Set([
          ...current.enabledModules,
          ...getActivityModuleIds(form.businessType, [...additionalActivityIds]),
        ])],
      }));
    }
  };

  const updateBusinessConfig = (patch: Partial<BusinessConfiguration>) =>
    setBusinessConfig((current) => ({ ...current, ...patch }));

  const setInventoryEnabled = (enabled: boolean) => {
    updateBusinessConfig({ trackInventory: enabled });
    setForm((current) => ({
      ...current,
      enabledModules: enabled
        ? [...new Set([...current.enabledModules, 'inventory'])]
        : current.enabledModules.filter((module) => module !== 'inventory'),
    }));
  };

  const toggleModule = (id: string) => setForm((prev) => ({
    ...prev,
    enabledModules: prev.enabledModules.includes(id)
      ? prev.enabledModules.filter((module) => module !== id)
      : withModuleDependencies([...prev.enabledModules, id]),
  }));

  const adminProfileError = security.required
    ? !options.users
      ? null
      : form.adminUsername.trim().length < 3 || form.adminUsername.trim().length > 50 || /\s/.test(form.adminUsername.trim())
      ? 'اسم المستخدم يجب أن يتكون من 3 إلى 50 حرفًا دون مسافات.'
      : form.adminFullName.trim().length < 2 || form.adminFullName.trim().length > 100
        ? 'الاسم المعروض يجب أن يتكون من حرفين إلى 100 حرف.'
        : form.adminPhone.trim().length > 30
          ? 'رقم الهاتف لا يمكن أن يتجاوز 30 حرفًا.'
          : null
    : null;
  const passwordPolicyError = (() => {
    if (!security.required || !newPassword) return null;
    try {
      AuthService.validatePasswordPolicy(newPassword, options.users ? form.adminUsername.trim() : security.username);
    } catch (error) {
      return error instanceof Error ? error.message : 'كلمة المرور غير مطابقة لسياسة الأمان.';
    }
    if (confirmPassword && newPassword !== confirmPassword) return 'كلمتا المرور غير متطابقتين.';
    return null;
  })();
  const passwordValid = !security.required
    || (Boolean(newPassword) && Boolean(confirmPassword) && !passwordPolicyError);
  const canContinue = step === 0
    ? !options.company || form.showroomName.trim().length >= 2
    : step === 1
      ? !options.branch || (form.branchName.trim().length >= 2 && form.warehouseName.trim().length >= 2)
      : step === 3
        ? !security.error && (!options.users || !adminProfileError) && passwordValid
        : true;

  // The default password may have been changed from the forced-password modal
  // (or another window) after this wizard mounted, so re-check before deciding
  // whether the admin password fields are still required.
  useEffect(() => {
    if (!security.required || step < 3) return;
    const current = readDefaultAdminState();
    if (!current.required) setSecurity(current);
  }, [step, security.required]);

  // Keep the wizard usable on short screens: whenever the step changes, scroll the
  // content area back to the top and move focus to the new step heading.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const finish = () => finishSetup({
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
  });

  const visibleSystemChecks: Array<[string, SystemCheckResult]> = [
    ['قاعدة البيانات', systemChecks.database],
    ['التخزين المحلي', systemChecks.storage],
    ['النسخ الاحتياطي', systemChecks.backup],
  ];
  const systemChecksRunning = visibleSystemChecks.some(([, result]) => result.state === 'checking');
  const setupOptionControl: SetupOptionControlRenderer = (key, title, description) => (
    <label
      htmlFor={`setup-option-${key}`}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-slate-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-slate-100"
    >
      <input
        id={`setup-option-${key}`}
        type="checkbox"
        checked={options[key]}
        onChange={() => toggleSetupOption(key)}
        disabled={saving}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-600"
      />
      <span>
        <span className="block text-xs font-bold">{title}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{description}</span>
      </span>
    </label>
  );

  return (
    <div
      className="flex min-h-dvh w-full items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-50 p-2 sm:p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header stays visible while only the step content scrolls. */}
        <SetupWizardHeader step={step} />

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          {draftSaveError && (
            <p role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              لم نتمكن من حفظ تقدم الإعداد تلقائيًا. سيظل بإمكانك إعادة المحاولة عند الإنهاء. {draftSaveError}
            </p>
          )}
          <h2 ref={stepHeadingRef} tabIndex={-1} className="sr-only">
            {STEPS[step].label}
          </h2>
          {step === 0 && (
            <CompanyStep
              options={options}
              form={form}
              set={set}
              setForm={setForm}
              systemChecks={systemChecks}
              visibleSystemChecks={visibleSystemChecks}
              systemChecksRunning={systemChecksRunning}
              onRecheckSystemChecks={() => setSystemCheckAttempt((attempt) => attempt + 1)}
              optionControl={setupOptionControl}
            />
          )}

          {step === 1 && (
            <BranchStep
              options={options}
              form={form}
              set={set}
              optionControl={setupOptionControl}
            />
          )}

          {step === 2 && (
            <ActivityStep
              options={options}
              form={form}
              set={set}
              businessConfig={businessConfig}
              visibleBusinessTypes={visibleBusinessTypes}
              activitySearch={activitySearch}
              setActivitySearch={setActivitySearch}
              activityFamily={activityFamily}
              setActivityFamily={setActivityFamily}
              selectBusinessType={selectBusinessType}
              toggleAdditionalActivity={toggleAdditionalActivity}
              toggleModule={toggleModule}
              updateBusinessConfig={updateBusinessConfig}
              optionControl={setupOptionControl}
            />
          )}

          {step === 3 && (
            <AccountingStep
              options={options}
              form={form}
              set={set}
              setForm={setForm}
              businessConfig={businessConfig}
              setInventoryEnabled={setInventoryEnabled}
              security={security}
              adminProfileError={adminProfileError}
              passwordPolicyError={passwordPolicyError}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              passwordVisible={passwordVisible}
              setPasswordVisible={setPasswordVisible}
              optionControl={setupOptionControl}
            />
          )}

          {step === 4 && (
            <ReviewStep
              options={options}
              form={form}
              businessConfig={businessConfig}
              security={security}
              currencySymbol={currencySymbol}
            />
          )}
        </div>

        <SetupWizardFooter
          step={step}
          canContinue={canContinue}
          passwordValid={passwordValid}
          saving={saving}
          onPrevious={() => setStep((s) => Math.max(0, s - 1))}
          onNext={() => canContinue && setStep((s) => s + 1)}
          onFinish={finish}
        />
      </div>
    </div>
  );
};

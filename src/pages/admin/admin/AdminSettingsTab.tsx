import React from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { AppearanceCustomizationTab } from './AppearanceCustomizationTab';
import { useAdminSettings } from './AdminSettingsTab/useAdminSettings';
import type { AdminSettingsTabProps } from './AdminSettingsTab/types';
import { GeneralTab } from './AdminSettingsTab/GeneralTab';
import { BusinessTab } from './AdminSettingsTab/BusinessTab';
import { BrandingTab } from './AdminSettingsTab/BrandingTab';
import { InvoiceTab } from './AdminSettingsTab/InvoiceTab';
import { InventoryTab } from './AdminSettingsTab/InventoryTab';
import { OperationsTab } from './AdminSettingsTab/OperationsTab';
import { SecurityTab } from './AdminSettingsTab/SecurityTab';
import { BackupTab } from './AdminSettingsTab/BackupTab';

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({ initialTab, onTabChange }) => {
  const {
    toast,
    readOnly,
    visibleTabs,
    tab,
    changeTab,
    settings,
    set,
    dirty,
    switchableUsers,
    businessProfile,
    setBusinessProfile,
    businessConfig,
    terminologyOverrides,
    setDirty,
    activitySearch,
    setActivitySearch,
    activityFamily,
    setActivityFamily,
    canViewConfigHistory,
    canManageLoginSettings,
    configurationVersions,
    configurationHistoryError,
    compareVersionIds,
    setCompareVersionIds,
    visiblePosPaymentMethods,
    printService,
    systemPrinters,
    isScanningPrinters,
    scannedPrintersCount,
    scanPrinters,
    previewModalOpen,
    setPreviewModalOpen,
    previewTemplate,
    setPreviewTemplate,
    previewSize,
    setPreviewSize,
    newReasonInput,
    setNewReasonInput,
    showAddReason,
    setShowAddReason,
    invoiceTableColumns,
    invoiceSectionOrder,
    setInvoiceTableColumn,
    setInvoiceTableColumnGroup,
    moveInvoiceTableColumn,
    moveInvoiceSection,
    save,
    resetDefaults,
    selectBusinessType,
    toggleAdditionalActivity,
    updateBusinessConfig,
    updateTermOverride,
    setInventoryEnabled,
    visibleBusinessTypes,
    restoreConfigurationForReview,
    comparedVersions,
    toggleBusinessModule,
    onLogo,
    previewStyle,
  } = useAdminSettings(initialTab, onTabChange);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => changeTab(item.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                active
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
        <div className="mr-auto flex items-center gap-2">
          <button onClick={resetDefaults} className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" /> استرجاع
          </button>
          <button
            onClick={save}
            disabled={readOnly || !dirty}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> حفظ التغييرات
          </button>
        </div>
      </div>

      <fieldset disabled={readOnly && tab !== 'backup'} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        {tab === 'general' && (
          <GeneralTab settings={settings} set={set} />
        )}

        {tab === 'business' && (
          <BusinessTab
            businessProfile={businessProfile}
            setBusinessProfile={setBusinessProfile}
            businessConfig={businessConfig}
            terminologyOverrides={terminologyOverrides}
            activitySearch={activitySearch}
            setActivitySearch={setActivitySearch}
            activityFamily={activityFamily}
            setActivityFamily={setActivityFamily}
            visibleBusinessTypes={visibleBusinessTypes}
            selectBusinessType={selectBusinessType}
            toggleAdditionalActivity={toggleAdditionalActivity}
            updateBusinessConfig={updateBusinessConfig}
            setInventoryEnabled={setInventoryEnabled}
            updateTermOverride={updateTermOverride}
            toggleBusinessModule={toggleBusinessModule}
            setDirty={setDirty}
            canViewConfigHistory={canViewConfigHistory}
            configurationVersions={configurationVersions}
            configurationHistoryError={configurationHistoryError}
            compareVersionIds={compareVersionIds}
            setCompareVersionIds={setCompareVersionIds}
            comparedVersions={comparedVersions}
            restoreConfigurationForReview={restoreConfigurationForReview}
            readOnly={readOnly}
          />
        )}

        {tab === 'branding' && (
          <BrandingTab
            settings={settings}
            set={set}
            onLogo={onLogo}
            previewStyle={previewStyle}
          />
        )}

        {tab === 'customization' && (
          <AppearanceCustomizationTab
            settings={settings}
            readOnly={readOnly}
            onChange={set}
          />
        )}

        {tab === 'invoice' && (
          <InvoiceTab
            settings={settings}
            set={set}
            readOnly={readOnly}
            toast={toast}
            printService={printService}
            systemPrinters={systemPrinters}
            isScanningPrinters={isScanningPrinters}
            scannedPrintersCount={scannedPrintersCount}
            scanPrinters={scanPrinters}
            previewModalOpen={previewModalOpen}
            setPreviewModalOpen={setPreviewModalOpen}
            previewTemplate={previewTemplate}
            setPreviewTemplate={setPreviewTemplate}
            previewSize={previewSize}
            setPreviewSize={setPreviewSize}
            onLogo={onLogo}
            invoiceTableColumns={invoiceTableColumns}
            invoiceSectionOrder={invoiceSectionOrder}
            setInvoiceTableColumn={setInvoiceTableColumn}
            setInvoiceTableColumnGroup={setInvoiceTableColumnGroup}
            moveInvoiceTableColumn={moveInvoiceTableColumn}
            moveInvoiceSection={moveInvoiceSection}
          />
        )}

        {tab === 'inventory' && (
          <InventoryTab settings={settings} set={set} />
        )}

        {tab === 'operations' && (
          <OperationsTab
            settings={settings}
            set={set}
            visiblePosPaymentMethods={visiblePosPaymentMethods}
            newReasonInput={newReasonInput}
            setNewReasonInput={setNewReasonInput}
            showAddReason={showAddReason}
            setShowAddReason={setShowAddReason}
          />
        )}

        {tab === 'security' && (
          <SecurityTab
            settings={settings}
            set={set}
            readOnly={readOnly}
            canManageLoginSettings={canManageLoginSettings}
            switchableUsers={switchableUsers}
          />
        )}

        {tab === 'backup' && (
          <BackupTab />
        )}

      </fieldset>

      {readOnly && tab !== 'backup' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          لا تملك صلاحية تعديل الإعدادات (settings.update). الحقول للعرض فقط.
        </div>
      )}
    </div>
  );
};

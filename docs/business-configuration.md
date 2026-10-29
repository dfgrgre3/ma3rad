# Business configuration

The application currently stores the selected business type and its operational defaults in `system_settings`. Module activation continues to use `ModuleRegistryService`; disabling a module hides and guards its routes without deleting its records.

## First-run setup

The first-run wizard appears only when setup is not marked complete and neither business records nor legacy business configuration are found. Existing products, customers, suppliers, transactions, and other operational records prevent the initial wizard from changing an established database. The wizard persists a versioned draft (excluding password fields) so an interrupted setup can be resumed.

The wizard collects company identity and registration details, configures the default branch and warehouse, selects the activity profile and modules, and saves currency, tax, inventory, costing, discount, and fiscal-year-start settings. It requires the built-in administrator to replace the default password before finishing. Related database updates run in a transaction. The wizard reports completion only after a successful persistence flush and verification.

The wizard updates the existing company, default branch, and default warehouse records; it does not create additional companies, branches, users, or opening transactions. The chart of accounts is seeded by database migrations. Product, customer, and supplier master data can be imported from the data-import page after setup, and opening balances must be entered through their respective workflows.

## Windows installer

Build the distributable installer with `npm run electron:dist`. electron-builder writes the assisted x64 NSIS installer to `release/` and asks for an installation folder; it creates Start menu and desktop shortcuts. The application stores its SQLite database and backups under `%APPDATA%\CeramiSysERP`, outside the installation directory. The GUI uninstaller keeps these files unless the user explicitly chooses the separate data-removal prompt; silent uninstall and upgrades preserve user data. The installer is not digitally signed.

## Activity catalog and shared profiles

The selectable activity catalog is in `src/config/activityCatalog.ts`. It gives each activity a stable id, family, and shared profile mapping; related activities reuse the versioned templates in `src/config/business-profiles/` rather than duplicating profile JSON. `businessProfiles.ts` validates catalog id uniqueness and template references when loading, and resolves each activity to its own profile identity and display metadata.

To add an activity, add its stable id and family/template mapping to `activityCatalog.ts`. Add a new JSON template only when its defaults materially differ from existing family profiles. Profile templates declare Arabic and English metadata, configuration defaults, the complete default/optional module selection, and explicit capability support statuses. Adding an activity does not itself implement industry workflows; shared profile defaults currently configure the existing business model, inventory flag, units, product attribute names, and default modules.

The setup wizard and activity settings support a primary activity plus secondary activities. Secondary profile defaults are merged additively: module defaults, units, and attributes are included, while removing a secondary activity does not silently remove enabled modules or user-edited fields. The saved `businessProfileConfig.additionalActivityIds` is validated against the built-in catalog.

## Terminology

`src/config/businessTerminology.ts` is the typed catalog of user-facing terms supported by the terminology engine. `TerminologyService` resolves values in this order:

1. Organization override saved in `businessTerminologyOverrides`.
2. The selected profile's term, when defined.
3. The Arabic catalog value.

The settings screen edits Arabic overrides under **النشاط والوحدات**. Values are validated against catalog keys, trimmed, length-limited, and checked for duplicate labels. Legacy English overrides are ignored so existing installations use Arabic labels. Existing `nav.labels` overrides remain more specific and take precedence for their navigation entry. Internal routes, database names, and business logic are not changed by terminology edits.

The application exposes an Arabic-only interface and does not provide a language selector. Business profile JSON retains English metadata for internal catalog validation, but only Arabic terminology is resolved for display. Native operating-system and installer dialogs may still use the system or installer language.

## Dynamic product attributes

Product attributes can be defined with text, number, boolean, date, single-select, or multi-select values. Profile templates provide a small set of industry-relevant attribute names where useful; these are suggestions stored as text attributes, not enforced industry workflows or typed regulatory data. Select options, required status, units, and the filterability flag are stored with the attribute; values are validated and persisted with products. Category-scoped attributes are shown and saved only for products in their configured category. The filterability flag is not yet connected to product-list filters. This does not yet make profile-specific workflows, reports, or other domain behavior dynamic.

## Support boundary

Existing business profiles provide defaults for units, product attributes, inventory tracking, and enabled modules; those defaults do not constitute complete industry-specific workflows. Profile JSON explicitly records gaps such as activity-specific accounting/workflow policies, report and print-template selection, expiry enforcement, e-commerce integrations, or clinical data management where relevant. A JSON declaration is not a substitute for implementing and testing the feature. A safe activity-conversion workflow and additional localization review of operating-system and installer dialogs remain separate work. Do not describe a profile as fully supported solely because it appears in the activity selector.

## Restaurant operations

The restaurant profile includes a table and kitchen workflow at `/restaurant`. Staff can manage branch-scoped dining tables, create dine-in, takeaway, and delivery tickets, advance each ticket item through preparation and service, and issue a linked invoice once every item has been served. Invoice linkage is unique per restaurant order so retrying checkout cannot create a duplicate invoice.

Menu items are explicitly enabled per branch from the existing product catalog. Recipes use active manufacturing bills of materials: starting preparation creates a production order, and marking the item ready consumes its ingredients and receives the prepared item into the selected warehouse using the existing inventory workflow. Recipe setup and preparation require the manufacturing permissions and enabled module. Ingredients must be stocked and costed according to the existing production and inventory rules. Restaurant tickets and kitchen status are currently local to the device; they are not synchronized between branches or devices.

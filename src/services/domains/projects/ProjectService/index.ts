import { DeliverablesLayer } from './deliverables';

/**
 * Public facade for the projects domain service.
 * The implementation is split by responsibility across the layer classes in
 * this folder (projects → units → products → tasks → time → budget → risks →
 * change requests → deliverables); this class only composes them.
 */
export class ProjectService extends DeliverablesLayer {}

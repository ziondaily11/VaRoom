import type { Category, CapturedControl, Fields, HotelMode, OfficeShopCharge, PropertyPurpose, SaleMode, WizardForm } from './formState';
import { emptyForm, isOfficeShop, REVIEW_STEP } from './formState';
import type { StoredDraft } from './draftCache';
import type { DocumentRef } from './policyDocuments';
import type { OfficeShopFiles } from './officeShop';
import { OFFICE_SHOP_AMENITY_KEYS, chargeRow, collectOfficeShopCharges, mergeOfficeShopPatch, officeShopControls, officeShopFromControls } from './officeShop';
import { amenitySnapshot } from './amenities';

// A listing draft as list.html saved it (IndexedDB on this device, and the
// form_data / media_metadata of /api/listing-drafts), built from the React
// form and restored into it. The shape is unchanged, so drafts saved before
// the migration still restore.

export type DocumentRefs = Record<string, DocumentRef[]>;

export interface FileSelection { filename: string; mimeType: string; fileSize: number; lastModified: number }

export interface DocumentSelections {
  propertyPolicy: FileSelection | null;
  officeShop: { floorPlan: FileSelection | null; policy: FileSelection | null; documents: Array<FileSelection | null> };
}

export interface MediaMetadata { name: string; type: string; kind: string; size: number; lastModified: number }

export interface DraftSnapshot extends StoredDraft {
  cacheKey: string;
  draftId: string | null;
  hostId: string;
  listingId: string | null;
  category: Category;
  createdAt: number;
  updatedAt: string;
  serverRevision: number;
  fields: Fields;
  propertyPurpose: PropertyPurpose;
  propertySalePriceMode: SaleMode;
  hotelListingMode: HotelMode | null;
  currentStep: number;
  furthestStep: number;
  /** 2: the six steps (Basics, Location, The space, Photos, Price & terms, Review). Missing: the old five. */
  stepVersion?: number;
  controls: CapturedControl[];
  amenities: Array<{ key: string; checked: boolean }>;
  officeShopAmenitySelections: Record<string, boolean>;
  officeShopPermittedUses: string[];
  officeShopCharges: Array<{ type: string; amount: number; frequency: string }>;
  uploadedDocumentRefs: DocumentRefs;
  documentSelections: DocumentSelections;
  mediaFiles: File[];
  policyFile: null;
  officeShopFiles: { floorPlan: null; policy: null; documents: [] };
  checkoutState?: boolean;
  serverMediaMetadata?: MediaMetadata[];
  mediaSelected?: boolean;
}

/** A remote draft row of /api/listing-drafts. */
export interface RemoteDraft {
  id: string;
  listing_id: string | null;
  category: string;
  form_data: Record<string, unknown> | null;
  media_metadata: MediaMetadata[] | null;
  created_at?: string;
  updated_at?: string;
  revision?: number;
}

/** What the wizard holds besides the form: the chosen files and uploaded documents. */
export interface WizardMedia {
  mediaFiles: File[];
  policyFile: File | null;
  officeShopFiles: OfficeShopFiles;
  documentRefs: DocumentRefs;
}

const fileSelection = (file: File | null | undefined): FileSelection | null => (
  file ? { filename: file.name, mimeType: file.type, fileSize: file.size, lastModified: file.lastModified || 0 } : null);

export interface SnapshotIdentity { cacheKey: string; draftId: string | null; hostId: string; listingId: string | null; serverRevision: number }

/** captureListingDraft(): the whole wizard as a draft snapshot. */
export function captureSnapshot(identity: SnapshotIdentity, category: Category, form: WizardForm, media: WizardMedia, priceUnit: string): DraftSnapshot {
  const officeShop = isOfficeShop(category);
  return {
    cacheKey: identity.cacheKey,
    draftId: identity.draftId,
    hostId: identity.hostId,
    listingId: identity.listingId || null,
    category,
    createdAt: Date.now(),
    updatedAt: new Date().toISOString(),
    serverRevision: identity.serverRevision,
    fields: { ...form.fields, 'price-unit': priceUnit },
    propertyPurpose: form.propertyPurpose,
    propertySalePriceMode: form.propertySalePriceMode,
    hotelListingMode: form.hotelListingMode,
    currentStep: form.currentStep,
    furthestStep: form.furthestStep,
    stepVersion: STEP_VERSION,
    controls: officeShop ? officeShopControls(form) : [],
    amenities: amenitySnapshot(category, form.amenities, form.officeShopAmenitySelections),
    officeShopAmenitySelections: officeShop
      ? Object.fromEntries(OFFICE_SHOP_AMENITY_KEYS.map((key) => [key, form.officeShopAmenitySelections[key] === true]))
      : {},
    officeShopPermittedUses: officeShop ? form.officeShopPermittedUses.slice() : [],
    officeShopCharges: officeShop ? collectOfficeShopCharges(form.officeShopCharges) : [],
    uploadedDocumentRefs: media.documentRefs,
    documentSelections: {
      propertyPolicy: fileSelection(media.policyFile),
      officeShop: {
        floorPlan: fileSelection(media.officeShopFiles.floorPlan),
        policy: fileSelection(media.officeShopFiles.policy),
        documents: media.officeShopFiles.documents.map(fileSelection),
      },
    },
    mediaFiles: media.mediaFiles.slice(),
    // Private document bytes upload to the document service instead of
    // being copied into browser storage.
    policyFile: null,
    officeShopFiles: { floorPlan: null, policy: null, documents: [] },
  };
}

/** The step numbering drafts are saved with (see DraftSnapshot.stepVersion). */
export const STEP_VERSION = 2;

/**
 * A saved step in today's numbering. Drafts from the five-step wizard
 * (About, Location, Photos & amenities, Pricing, Review) reopen on the same
 * place: Photos is now step 4, Pricing 5 and Review 6.
 */
export function savedStep(step: number, version: unknown): number {
  const mapped = version === STEP_VERSION ? step : ([0, 1, 2, 4, 5, 6][Math.max(1, Math.min(5, step))] || 1);
  return Math.max(1, Math.min(REVIEW_STEP, mapped));
}

const FORM_DATA_KEYS = ['fields', 'controls', 'propertyPurpose', 'propertySalePriceMode', 'hotelListingMode', 'currentStep', 'furthestStep', 'stepVersion', 'amenities',
  'officeShopAmenitySelections', 'officeShopPermittedUses', 'officeShopCharges', 'uploadedDocumentRefs', 'documentSelections'] as const;

/** The server copy's form_data. */
export function draftFormData(draft: Partial<DraftSnapshot>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  FORM_DATA_KEYS.forEach((key) => { data[key] = draft[key]; });
  return data;
}

/** The server copy's media_metadata: chosen media, chosen documents, uploaded documents. */
export function draftMediaMetadata(draft: Partial<DraftSnapshot>): MediaMetadata[] {
  const metadata: MediaMetadata[] = (draft.mediaFiles || []).map((file) => (
    { name: file.name, type: file.type, kind: 'listing_media', size: file.size, lastModified: file.lastModified }));
  const selections = draft.documentSelections;
  const refs = draft.uploadedDocumentRefs || {};
  const officeShop = selections && selections.officeShop;
  ([
    ['property_policy', selections && selections.propertyPolicy],
    ['floor_plan', officeShop && officeShop.floorPlan],
    ['commercial_policy', officeShop && officeShop.policy],
  ] as Array<[string, FileSelection | null | undefined]>).forEach(([kind, item]) => {
    if (item) metadata.push({ name: item.filename, type: item.mimeType, kind, size: item.fileSize, lastModified: item.lastModified });
  });
  ((officeShop && officeShop.documents) || []).forEach((item) => {
    if (item) metadata.push({ name: item.filename, type: item.mimeType, kind: 'ownership_management', size: item.fileSize, lastModified: item.lastModified });
  });
  Object.keys(refs).forEach((kind) => (refs[kind] || []).forEach((item) => {
    metadata.push({ name: item.filename || '', type: item.mimeType || '', kind, size: item.fileSize || 0, lastModified: item.lastModified || 0 });
  }));
  return metadata;
}

// ---------- Restore ----------

const PURPOSES: PropertyPurpose[] = ['rent', 'sale', 'both'];
const HOTEL_MODES: HotelMode[] = ['stay', 'table', 'both'];

function sanitizeRefs(value: unknown): DocumentRefs {
  const refs: DocumentRefs = {};
  if (!value || typeof value !== 'object') return refs;
  Object.keys(value as object).forEach((type) => {
    const list = (value as Record<string, unknown>)[type];
    refs[type] = (Array.isArray(list) ? list : []).filter((ref) => ref && typeof (ref as DocumentRef).id === 'string').map((ref) => {
      const item = ref as Partial<DocumentRef>;
      return { id: String(item.id), documentType: type, filename: String(item.filename || ''), fileSize: Number(item.fileSize) || 0, lastModified: Number(item.lastModified) || 0, mimeType: String(item.mimeType || '') };
    });
  });
  return refs;
}

export interface RestoredDraft { form: WizardForm; mediaFiles: File[]; documentRefs: DocumentRefs }

/** A saved snapshot (either page's) → the wizard form, as restoreListingDraftAfterUpgrade applied it. */
export function restoreSnapshot(snapshot: Partial<DraftSnapshot>, category: Category): RestoredDraft {
  let form = emptyForm();
  const fields: Fields = {};
  Object.entries(snapshot.fields || {}).forEach(([id, value]) => {
    if (typeof value === 'string' || typeof value === 'boolean') fields[id] = value;
    else if (typeof value === 'number') fields[id] = String(value);
  });
  // Drafts from before the property type select restored it from size-or-type.
  if (category === 'property' && !Object.prototype.hasOwnProperty.call(fields, 'property-bedroom-type') && typeof fields['size-or-type'] === 'string') {
    fields['property-bedroom-type'] = fields['size-or-type'];
  }
  form.fields = fields;
  if (category === 'property' && PURPOSES.includes(snapshot.propertyPurpose as PropertyPurpose)) form.propertyPurpose = snapshot.propertyPurpose as PropertyPurpose;
  if (category === 'property' && (snapshot.propertySalePriceMode === 'exact' || snapshot.propertySalePriceMode === 'starting')) form.propertySalePriceMode = snapshot.propertySalePriceMode;
  if (category === 'hotel' && HOTEL_MODES.includes(snapshot.hotelListingMode as HotelMode)) form.hotelListingMode = snapshot.hotelListingMode as HotelMode;
  if (isOfficeShop(category)) {
    form = mergeOfficeShopPatch(form, officeShopFromControls(snapshot.controls));
    if (snapshot.officeShopAmenitySelections && typeof snapshot.officeShopAmenitySelections === 'object') {
      const selections: Record<string, boolean> = {};
      Object.keys(snapshot.officeShopAmenitySelections).forEach((key) => { selections[key] = snapshot.officeShopAmenitySelections![key] === true; });
      form = mergeOfficeShopPatch(form, { officeShopAmenitySelections: selections });
    }
    if (Array.isArray(snapshot.officeShopPermittedUses)) form.officeShopPermittedUses = snapshot.officeShopPermittedUses.filter((use) => typeof use === 'string');
    if (Array.isArray(snapshot.officeShopCharges)) form.officeShopCharges = snapshot.officeShopCharges.map(chargeRow) as OfficeShopCharge[];
  }
  if (Array.isArray(snapshot.amenities)) {
    form.amenities = snapshot.amenities.filter((item) => item && typeof item.key === 'string').map((item) => ({ key: item.key, checked: item.checked === true }));
  }
  if (Number.isInteger(snapshot.furthestStep)) form.furthestStep = savedStep(Number(snapshot.furthestStep), snapshot.stepVersion);
  if (Number.isInteger(snapshot.currentStep)) form.currentStep = savedStep(Number(snapshot.currentStep), snapshot.stepVersion);
  const mediaFiles = Array.isArray(snapshot.mediaFiles)
    ? snapshot.mediaFiles.filter((file) => file && typeof file.name === 'string' && typeof file.slice === 'function') : [];
  return { form, mediaFiles, documentRefs: sanitizeRefs(snapshot.uploadedDocumentRefs) };
}

/** A server draft with no device copy → a snapshot (no media files). */
export function snapshotFromRemote(remote: RemoteDraft, hostId: string, cacheKey: string): Partial<DraftSnapshot> {
  const formData = (remote.form_data || {}) as Partial<DraftSnapshot>;
  return {
    ...formData,
    cacheKey,
    draftId: remote.id,
    hostId,
    listingId: remote.listing_id || null,
    category: remote.category as Category,
    createdAt: new Date(remote.updated_at || '').getTime() || Date.now(),
    updatedAt: remote.updated_at || new Date().toISOString(),
    serverRevision: Number(remote.revision) || 0,
    fields: formData.fields || {},
    mediaFiles: [],
    policyFile: null,
    serverMediaMetadata: remote.media_metadata || [],
  };
}

/** The pending (chosen but not uploaded) documents a snapshot names, old snapshots included. */
export function pendingDocumentSelections(snapshot: Partial<DraftSnapshot>): number {
  const legacy = snapshot as { policyFile?: { name?: string } | null; officeShopFiles?: { floorPlan?: unknown; policy?: unknown; documents?: unknown[] } };
  const selections = snapshot.documentSelections;
  if (selections) {
    const office = selections.officeShop || { floorPlan: null, policy: null, documents: [] };
    return [selections.propertyPolicy, office.floorPlan, office.policy, ...(Array.isArray(office.documents) ? office.documents : [])].filter(Boolean).length;
  }
  const office = legacy.officeShopFiles || {};
  return [legacy.policyFile, office.floorPlan, office.policy, ...(Array.isArray(office.documents) ? office.documents : [])].filter(Boolean).length;
}

export const sameCategory = (a: string | null | undefined, b: string | null | undefined) => a === b || (isOfficeShop(a) && isOfficeShop(b));

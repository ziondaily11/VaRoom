import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { getListingFeedCache } from '../lib/listingFeedCache';
import type { Category, FieldBinding, FieldValue, HotelMode, PropertyPurpose, SaleMode, WizardForm } from '../lib/listWizard/formState';
import { REVIEW_STEP, emptyForm, isOfficeShop, listingAreaParts, joinListingArea, text, checked } from '../lib/listWizard/formState';
import { pricePreview, reviewMeta, reviewPrice, unitLabel, wizardCopy } from '../lib/listWizard/copy';
import { createListingDraftCache } from '../lib/listWizard/draftCache';
import type { DocumentRefs, WizardMedia } from '../lib/listWizard/drafts';
import { captureSnapshot } from '../lib/listWizard/drafts';
import {
  activateListing, addMediaFiles, deleteListingShell, deleteRemoteDraft, isVideoFile, latestRef, MAX_MEDIA, saveBookingDetails, saveDiningConfig, saveListing,
  listingPhotoFingerprints, photoFingerprint, uploadListingDocument, uploadListingPhoto, uploadListingVideo,
} from '../lib/listWizard/api';
import {
  bookingDetailsFor, diningBody, effectivePriceUnit, isPaidNiche, isPlanNiche, listingPayload, mediaUploadBlocksPublish, needsListingPayment, officeShopDetailsFor,
  reviewActions, savesBookingDetails, shellPayload, shouldActivate, uploadPendingMedia, withOfficeShopDocuments,
} from '../lib/listWizard/publish';
import type { PublicationState } from '../lib/listWizard/publish';
import { removeCurrentPolicyDocument, resolveCurrentPolicyPreview } from '../lib/listWizard/policyDocuments';
import type { OfficeShopFiles, OfficeShopKind } from '../lib/listWizard/officeShop';
import { listingDocumentMimeType, officeShopBusinessHoursError, officeShopConditions } from '../lib/listWizard/officeShop';
import { WizardSession, draftContinuationUrl } from '../lib/listWizard/wizardSession';
import { INITIAL_FLAGS, hasListingCredit, startWizard } from '../lib/listWizard/startup';
import { differenceHash, judgePhoto, measurePhoto, minPhotosFor } from '../lib/listWizard/photoQuality';
import {
  checkListingPayment, checkReturnedPayment, LISTING_TIER_CARDS, NICHE_PLAN_CARDS, startCheckout, startListingTierCheckout, upgradeCards,
  type ListingPayment, type ListingTier, type PaymentState, type PlanCard,
} from '../lib/billing/pricing';
import { CheckoutWindow } from '../components/billing/CheckoutWindow';
import type { Flags, Message } from '../lib/listWizard/startup';
import { selectedAmenityKeys, setAmenityChecked, amenityOptionsFor } from '../lib/listWizard/amenities';
import { elieListingFacts } from '../lib/listWizard/elieFacts';
import { LIST_WIZARD_STYLES } from '../components/listWizard/listWizardStyles';
import { INITIAL_SAVE_STATUS, PanelActions, StepAlert, StepFrame, StepPhoto, WizardProgress } from '../components/listWizard/StepFrame';
import type { SaveStatus } from '../components/listWizard/StepFrame';
import { BookingFields, HotelModeChoice, IntroFields, OfficeShopTypeChoice, PropertyPurposeChoice, SpaceFields } from '../components/listWizard/WizardFields';
import { MediaPicker, PhotoLightbox, useObjectUrls } from '../components/listWizard/MediaPicker';
import type { LightboxItem } from '../components/listWizard/MediaPicker';
import { ReviewCard, ReviewHero } from '../components/listWizard/ReviewStep';
import type { ReviewLine } from '../components/listWizard/ReviewStep';
import { PolicyField, PolicyPreviewOverlay } from '../components/listWizard/PolicyDocument';
import type { PolicyPreviewState } from '../components/listWizard/PolicyDocument';
import { LeaveDialog } from '../components/listWizard/LeaveDialog';
import { ListingTierChoice } from '../components/listWizard/ListingTierChoice';
import type { LeaveStage } from '../components/listWizard/LeaveDialog';
import { AmenitiesField, AmenitiesLibrary } from '../components/listWizard/AmenitiesLibrary';
import { OfficeShopDetails, OfficeShopDocuments, OfficeShopLocation, OfficeShopPricing, OfficeShopReview, OfficeShopSpace } from '../components/listWizard/OfficeShopFields';
import type { ExistingListingDocument } from '../components/listWizard/OfficeShopFields';
import { profileWithNiche } from '../lib/auth/session';
import { managerHostId, useWorkspace } from '../lib/team/team';

// List a space (migrated from legacy-pages/list.html; also served at
// /properties): the five-step listing wizard for creating or editing
// (?edit=<id>) a listing. Drafts save to this device and to My Profile as the
// host types. Property and Shops & Offices first pay for Silver or Gold
// (Paystack brings the host back here) and publishing uses that payment.
// Publishing returns to Host home without a reload.

const TOTAL_STEPS = REVIEW_STEP;
const EMPTY_FILES: OfficeShopFiles = { floorPlan: null, policy: null, documents: [] };

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback;

const browserStorage = (): Storage | null => { try { return window.localStorage; } catch (_) { return null; } };

/** A field's label as the host sees it ("Title"), without "(optional)" notes. */
function fieldName(field: HTMLElement | null): string {
  if (!field) return 'this field';
  const label = field.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(field.id)}"]`) : null;
  const text = (label?.textContent || field.getAttribute('aria-label') || field.getAttribute('placeholder') || 'this field')
    .replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  return text || 'this field';
}

/** Plain words for why a required field fails. */
function invalidMessage(field: HTMLInputElement): string {
  const name = fieldName(field);
  const { validity } = field;
  if (validity.customError) return field.validationMessage;
  if (validity.valueMissing) {
    if (field.type === 'checkbox') return `Tick “${name}” to continue.`;
    if (field.tagName === 'SELECT' || field.type === 'radio') return `Choose ${name}.`;
    return `Fill in ${name}.`;
  }
  if (validity.tooShort) return `${name}: use at least ${field.minLength} characters.`;
  if (validity.tooLong) return `${name}: use at most ${field.maxLength} characters.`;
  if (validity.rangeUnderflow) return `${name}: the lowest allowed is ${field.min}.`;
  if (validity.rangeOverflow) return `${name}: the highest allowed is ${field.max}.`;
  return `${name}: ${field.validationMessage}`;
}

export default function ListPage() {
  const router = useRouter();
  const { status, user } = useAuth();
  const client = getSupabaseClient();
  const ownId = user?.id || null;
  // The host whose listing this is: the account's own, or the company a team Manager works as.
  const userId = managerHostId(ownId, useWorkspace(ownId));

  // ---------- State ----------
  const [checkingText, setCheckingText] = useState('Checking your account...');
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<Category>('airbnb');
  const [officeShopTypeSelected, setOfficeShopTypeSelected] = useState(false);
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [officeShopFiles, setOfficeShopFiles] = useState<OfficeShopFiles>(EMPTY_FILES);
  const [documentRefs, setDocumentRefs] = useState<DocumentRefs>({});
  const [existingPhotos, setExistingPhotos] = useState<Array<{ url: string }>>([]);
  const [existingPolicyUrl, setExistingPolicyUrl] = useState<string | null>(null);
  const [existingDocuments, setExistingDocuments] = useState<ExistingListingDocument[] | null>(null);
  const [flags, setFlags] = useState<Flags>(INITIAL_FLAGS);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(INITIAL_SAVE_STATUS);
  const [message, setMessage] = useState<Message | null>(null);
  const [messageTick, setMessageTick] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxItem>(null);
  const [library, setLibrary] = useState<{ open: boolean; trigger: HTMLElement | null }>({ open: false, trigger: null });
  const [policyPreview, setPolicyPreview] = useState<PolicyPreviewState>(null);
  const [policyRemoving, setPolicyRemoving] = useState(false);
  const [leave, setLeave] = useState<{ open: boolean; stage: LeaveStage; destination: string; busy: 'save' | 'discard' | null }>({ open: false, stage: 'choose', destination: '/host-home', busy: null });
  const [publishLabel, setPublishLabel] = useState<string | null>(null);
  /** The Silver / Gold plan being paid for in the checkout window. */
  const [checkoutCard, setCheckoutCard] = useState<PlanCard | null>(null);
  /** Which chosen photo the review shows (the carousel and the review card's thumbnail). */
  const [reviewIndex, setReviewIndex] = useState(0);
  // What stops the host moving on, shown under the step (not a browser pop-up).
  const [stepError, setStepError] = useState<{ step: number; text: string } | null>(null);
  // Which way the last step change went, for the slide (none on first paint).
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null);
  const [stepPhoto3, setStepPhoto3] = useState<HTMLDivElement | null>(null);

  const messageRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<WizardSession | null>(null);
  const publishing = useRef(false);
  /** Media already uploaded by an earlier publish attempt (a retry skips them). */
  const uploadedMedia = useRef(new Set<File>());
  const editOfficeDocs = useRef<Record<string, unknown> | null>(null);
  const draftCache = useMemo(() => (typeof window === 'undefined' ? null : createListingDraftCache()), []);

  const query = useRef<{ edit: string | null; draft: string | null; payment: string | null; subscription: string | null; reference: string | null } | null>(null);
  if (!query.current && router.isReady) {
    const value = (key: string) => (typeof router.query[key] === 'string' ? (router.query[key] as string) : null);
    query.current = { edit: value('edit'), draft: value('draft'), payment: value('payment'), subscription: value('subscription'), reference: value('reference') || value('trxref') };
  }
  const editListingId = query.current ? query.current.edit : null;
  const editMode = Boolean(editListingId);

  // The latest state, for async flows and the draft snapshot.
  const latest = useRef({ category, form, media: { mediaFiles, policyFile, officeShopFiles, documentRefs } as WizardMedia, flags, existingPolicyUrl });
  latest.current = { category, form, media: { mediaFiles, policyFile, officeShopFiles, documentRefs }, flags, existingPolicyUrl };

  const showMessage = useCallback((text: string, error: boolean) => { setMessage({ text, error }); setMessageTick((tick) => tick + 1); }, []);
  useEffect(() => {
    if (messageTick && messageRef.current) messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [messageTick]);

  const token = useCallback(async (): Promise<string | null> => {
    if (!client || !userId) return null;
    const { data: { session } } = await client.auth.getSession();
    return session && session.access_token && session.user.id === ownId ? session.access_token : null;
  }, [client, ownId]);

  /** Updates the chosen media/documents now (for the flow in progress) and on screen. */
  const patchMedia = useCallback((patch: Partial<WizardMedia>) => {
    latest.current = { ...latest.current, media: { ...latest.current.media, ...patch } };
    if (patch.mediaFiles) setMediaFiles(patch.mediaFiles);
    if (patch.policyFile !== undefined) setPolicyFile(patch.policyFile);
    if (patch.officeShopFiles) setOfficeShopFiles(patch.officeShopFiles);
    if (patch.documentRefs) setDocumentRefs(patch.documentRefs);
  }, []);

  // ---------- The draft session ----------
  const session = useMemo(() => {
    if (!userId || !draftCache || !router.isReady) return null;
    const created = new WizardSession({
      hostId: userId,
      editMode: Boolean(query.current && query.current.edit),
      cache: draftCache,
      storage: browserStorage(),
      capture: (identity) => {
        const state = latest.current;
        return captureSnapshot(identity, state.category, state.form, state.media, effectivePriceUnit(state.category, state.form.fields));
      },
      token,
      onStatus: (text, state) => setSaveStatus({ message: text, state }),
      onDraftId: (draftId) => {
        // Keep the draft in the URL so a refresh reopens this session rather than starting a second one.
        const url = draftContinuationUrl(query.current, window.location.pathname, window.location.search, draftId);
        if (url) void router.replace(url, undefined, { shallow: true, scroll: false });
      },
      paymentVerified: () => {
        const state = latest.current.flags;
        return state.paymentVerified || state.returnedPaymentVerified || state.subscriptionVerified;
      },
    });
    created.draftId = query.current ? query.current.draft : null;
    if (query.current && query.current.edit) created.listingId = query.current.edit;
    return created;
    // One session per signed-in host and page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, draftCache, router.isReady]);
  sessionRef.current = session;

  const queueSave = useCallback(() => { if (ready && sessionRef.current) sessionRef.current.queueSave(); }, [ready]);

  useEffect(() => {
    if (!session) return undefined;
    const onOnline = () => { if (session.revisionConflict) return; session.remoteUnavailable = false; session.queueSave(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') session.queueSave(); };
    const onPageHide = () => session.saveBeforeLeaving();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // Leaving the wizard inside the app saves like leaving the page did.
      session.saveBeforeLeaving();
    };
  }, [session]);

  // ---------- Form editing ----------
  const setField = useCallback((id: string, value: FieldValue) => {
    setForm((previous) => ({ ...previous, fields: { ...previous.fields, [id]: value } }));
    queueSave();
  }, [queueSave]);
  const setFields = useCallback((patch: Record<string, FieldValue>) => {
    setForm((previous) => ({ ...previous, fields: { ...previous.fields, ...patch } }));
    queueSave();
  }, [queueSave]);
  const update = useCallback((patch: Partial<WizardForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    queueSave();
  }, [queueSave]);
  const binding: FieldBinding = { fields: form.fields, setField };

  const goToStep = useCallback((target: number) => {
    const step = Math.max(1, Math.min(TOTAL_STEPS, target));
    setDirection((previous) => (step === latest.current.form.currentStep ? previous : step > latest.current.form.currentStep ? 'forward' : 'back'));
    setForm((previous) => ({ ...previous, currentStep: step, furthestStep: Math.max(previous.furthestStep, step) }));
    if (sessionRef.current && !sessionRef.current.restoring) queueSave();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [queueSave]);

  // ---------- Derived ----------
  const officeShop = isOfficeShop(category);
  const kind = (officeShop ? category : 'office') as OfficeShopKind;
  const copy = wizardCopy(category, form.hotelListingMode, form.propertyPurpose, editMode);
  const priceUnit = effectivePriceUnit(category, form.fields);
  const tableOnly = category === 'hotel' && form.hotelListingMode === 'table';
  const mediaUrls = useObjectUrls(mediaFiles);
  const publication: PublicationState = {
    category, editMode, paymentVerified: flags.paymentVerified, hasActiveNichePlan: flags.hasActiveNichePlan, hasCurrentListingFee: flags.hasCurrentListingFee,
    hasListingCredit: hasListingCredit(flags), listingIsPaused: flags.listingIsPaused, listingNeedsPublication: flags.listingNeedsPublication, listingIsMarked: flags.listingIsMarked,
  };
  const paymentNeeded = needsListingPayment(publication);
  // Why videos can't be added to this listing, or null when they can (the server checks the same: lib/videoEntitlement.js).
  const videoAllowance = flags.videoListings;
  const videoNote = isPaidNiche(category) ? 'Silver and Gold listings use photos. Video tours come with Airbnb, Hotel and Venue plans.'
    : !videoAllowance.limit ? 'Your plan does not include video. Upgrade to add video tours.'
      : !mediaFiles.some(isVideoFile) && videoAllowance.used >= videoAllowance.limit
        ? `Your plan includes video on ${videoAllowance.limit} listing${videoAllowance.limit === 1 ? '' : 's'}, and all are in use. Upgrade for more, or pause a listing that has a video.`
        : null;
  const amount = text(form.fields, 'price-amount');
  const saleAmount = text(form.fields, 'property-sale-price');
  const preview = pricePreview(category, form.propertyPurpose, form.propertySalePriceMode, amount, saleAmount, priceUnit);

  // ---------- Validation (messages in the page, under the step) ----------
  const frame = (step: number) => formRef.current?.querySelector<HTMLElement>(`.step-frame[data-step="${step}"]`) || null;
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  /** Show why the step can't continue, mark and bring the field into view. */
  const report = (step: number, field: HTMLElement | null, messageText: string) => {
    setStepError({ step, text: messageText });
    if (!field) return;
    field.setAttribute('aria-invalid', 'true');
    const clear = () => { field.removeAttribute('aria-invalid'); if (field instanceof HTMLInputElement) field.setCustomValidity(''); };
    field.addEventListener('input', clear, { once: true });
    field.addEventListener('change', clear, { once: true });
    // After the step (possibly another one) has been shown and the page scrolled to its top.
    window.setTimeout(() => {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.focus({ preventScroll: true });
    }, 80);
  };

  const validateStep = (step: number): boolean => {
    const state = latest.current;
    const cat = state.category;
    const fields = state.form.fields;
    if (step === 1 && isOfficeShop(cat) && !officeShopTypeSelected) {
      report(1, formRef.current?.querySelector<HTMLButtonElement>('[data-office-shop-type]') || null, 'Choose whether you are listing an Office or a Shop.');
      return false;
    }
    if (step === 1 && cat === 'hotel' && !state.form.hotelListingMode) {
      report(1, formRef.current?.querySelector<HTMLButtonElement>('[data-hotel-mode]') || null, 'Choose whether this hotel offers stays, table reservations, or both.');
      return false;
    }
    if (step === 5 && cat === 'property') {
      const purpose = state.form.propertyPurpose;
      const checks: string[] = purpose === 'sale' ? ['property-sale-price'] : purpose === 'both' ? ['price-amount', 'property-sale-price'] : ['price-amount'];
      for (const id of checks) {
        const value = text(fields, id);
        if (!value || Number(value) <= 0) {
          // 0 used to pass silently.
          report(5, byId<HTMLInputElement>(id), value ? 'Enter a price greater than 0.' : `Fill in ${fieldName(byId(id))}.`);
          return false;
        }
      }
    }
    if (step === 3 && isOfficeShop(cat)) {
      const hoursError = officeShopBusinessHoursError(fields, cat as OfficeShopKind);
      if (hoursError) { report(3, byId<HTMLInputElement>('os-operating-hours-to'), hoursError); return false; }
    }
    if (step === 5 && isOfficeShop(cat)) {
      const conditions = officeShopConditions(fields, cat as OfficeShopKind);
      // The desks are asked under "The space"; per-desk pricing needs them.
      if (conditions.desksForPricing && !(Number(text(fields, 'os-desks')) >= 1)) {
        report(5, byId<HTMLSelectElement>('os-pricing-basis'), 'Per-desk pricing needs the number of desks. Add it in step 3, "The space".');
        return false;
      }
    }
    if (step === 4) {
      // A new listing needs enough photos (videos don't count); a hotel restaurant-only listing needs fewer.
      const photos = state.media.mediaFiles.filter((file) => !isVideoFile(file)).length + existingPhotos.length;
      const needed = minPhotosFor(cat === 'hotel' && state.form.hotelListingMode === 'table');
      const missing = !editMode && photos < needed
        ? `Add at least ${needed} photos (${photos} so far). Videos don't count towards this.`
        : isOfficeShop(cat) && state.media.mediaFiles.length === 0 && existingPhotos.length === 0
          ? 'Add at least one photo or video of the actual unit before continuing.'
          : null;
      if (missing) {
        setPhotoError(missing);
        dropzoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    }
    if (step === REVIEW_STEP && isOfficeShop(cat) && !checked(fields, 'os-accuracy-confirmed')) {
      report(REVIEW_STEP, byId<HTMLInputElement>('os-accuracy-confirmed'), 'Confirm that availability and pricing are accurate today before publishing.');
      return false;
    }
    const element = frame(step);
    if (!element) return true;
    for (const field of Array.from(element.querySelectorAll<HTMLInputElement>('[required]'))) {
      if (!field.checkValidity()) { report(step, field, invalidMessage(field)); return false; }
    }
    setStepError(null);
    return true;
  };

  const next = () => { if (validateStep(form.currentStep)) goToStep(form.currentStep + 1); };
  const back = () => { setStepError(null); goToStep(form.currentStep - 1); };
  const jumpTo = (target: number) => { setStepError(null); goToStep(target); };

  // ---------- Documents ----------

  /** Uploads the chosen documents to the listing (dedup by file), then forgets the choices. */
  const persistSelectedDocuments = useCallback(async (listingId: string) => {
    const accessToken = await token();
    if (!accessToken) throw new Error('Please sign in again before uploading documents.');
    const { category: cat, media } = latest.current;
    let refs = media.documentRefs;
    const property = media.policyFile;
    const files = media.officeShopFiles;
    if (cat === 'property' && property) {
      refs = (await uploadListingDocument(accessToken, property, 'property_policy', listingId, refs)).refs;
      patchMedia({ documentRefs: refs, policyFile: latest.current.media.policyFile === property ? null : latest.current.media.policyFile });
    }
    if (isOfficeShop(cat)) {
      if (files.floorPlan) refs = (await uploadListingDocument(accessToken, files.floorPlan, 'floor_plan', listingId, refs)).refs;
      if (files.policy) refs = (await uploadListingDocument(accessToken, files.policy, 'commercial_policy', listingId, refs)).refs;
      for (const file of files.documents) refs = (await uploadListingDocument(accessToken, file, 'ownership_management', listingId, refs)).refs;
      const now = latest.current.media.officeShopFiles;
      patchMedia({
        documentRefs: refs,
        officeShopFiles: {
          floorPlan: now.floorPlan === files.floorPlan ? null : now.floorPlan,
          policy: now.policy === files.policy ? null : now.policy,
          documents: now.documents.filter((file) => !files.documents.includes(file)),
        },
      });
    }
    sessionRef.current?.queueSave();
  }, [token, patchMedia]);

  // ---------- Startup ----------
  useEffect(() => {
    if (status === 'signed-out') void router.replace(loginUrl(router.asPath));
  }, [status, router]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || status !== 'signed-in' || !client || !userId || !session || !query.current) return;
    started.current = true;
    const params = query.current;
    if (params.reference && (['return', 'verified'].includes(params.payment || '') || ['return', 'verified'].includes(params.subscription || ''))) setCheckingText('Confirming your payment...');
    void startWizard({
      client, session, draftCache, hostId: userId, params,
      readProfile: profileWithNiche,
      onChecking: setCheckingText,
      replaceUrl: (url) => { void router.replace(url, undefined, { shallow: true, scroll: false }); },
    }).then((outcome) => {
      if (outcome.status === 'signed-out') { void router.replace(loginUrl(router.asPath)); return; }
      if (outcome.status === 'stopped') {
        setCheckingText(outcome.text);
        if (outcome.redirect) { const { to, delayMs } = outcome.redirect; setTimeout(() => { void router.replace(to); }, delayMs); }
        return;
      }
      setCategory(outcome.category);
      setFlags(outcome.flags);
      setOfficeShopTypeSelected(outcome.officeShopTypeSelected);
      latest.current = { ...latest.current, category: outcome.category, flags: outcome.flags };
      patchMedia(outcome.media);
      if (outcome.form) {
        latest.current = { ...latest.current, form: outcome.form };
        setForm(outcome.form);
      }
      if (outcome.edit) {
        setExistingPhotos(outcome.edit.existingPhotos);
        setExistingPolicyUrl(outcome.edit.existingPolicyUrl);
        if (isOfficeShop(outcome.category)) setExistingDocuments(outcome.edit.documents as ExistingListingDocument[]);
        editOfficeDocs.current = outcome.edit.officeShopDocuments;
      }
      setReady(true);
      const last = outcome.messages[outcome.messages.length - 1];
      if (last) showMessage(last.text, last.error);
    }, (error: unknown) => {
      console.error('The listing wizard could not start:', error);
      setCheckingText(`Unable to load this listing: ${errorMessage(error, 'Please try again.')}`);
    });
    // Runs once per visit when the account is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, client, userId, session]);

  // ---------- Media ----------
  // Each photo's hash, for spotting the same photo twice (restored photos are measured when next compared).
  const photoHashes = useRef(new WeakMap<File, string>());
  const hashOf = async (file: File) => {
    const known = photoHashes.current.get(file);
    if (known) return known;
    const { gray, grayWidth, grayHeight } = await measurePhoto(file);
    const hash = differenceHash(gray, grayWidth, grayHeight);
    photoHashes.current.set(file, hash);
    return hash;
  };
  /**
   * Adds picked files: the type, count and video rules, then each photo's
   * quality (photoQuality.ts). Clear failures are refused with the reason;
   * borderline photos are kept with a note.
   */
  const addMedia = async (incoming: File[]) => {
    if (editMode) return;
    const before = latest.current.media.mediaFiles;
    const result = addMediaFiles(before, incoming, videoNote);
    const added = result.files.filter((file) => !before.includes(file));
    const refused: string[] = result.error ? [result.error] : [];
    const notes: string[] = [];
    const accepted: File[] = [];
    const hashes: string[] = [];
    for (const file of before) if (!isVideoFile(file)) { try { hashes.push(await hashOf(file)); } catch { /* An unreadable earlier photo is not compared. */ } }
    for (const file of added) {
      if (isVideoFile(file)) { accepted.push(file); continue; }
      try {
        const verdict = judgePhoto(file.name, await measurePhoto(file), hashes);
        if (verdict.refused) { refused.push(verdict.refused); continue; }
        photoHashes.current.set(file, verdict.hash);
        hashes.push(verdict.hash);
        accepted.push(file);
        if (verdict.notes.length) notes.push(`"${file.name}" ${verdict.notes.join(' and ')}. You can keep it or replace it.`);
      } catch {
        refused.push(`"${file.name}" could not be read as a photo.`);
      }
    }
    const message = [...refused, ...notes].join(' ');
    setPhotoError(message || null);
    // Photos added meanwhile stay; the limit still holds.
    patchMedia({ mediaFiles: latest.current.media.mediaFiles.concat(accepted).slice(0, MAX_MEDIA) });
    queueSave();
  };
  const removeMedia = (index: number) => {
    const files = mediaFiles.slice();
    files.splice(index, 1);
    setPhotoError(null);
    patchMedia({ mediaFiles: files });
    queueSave();
  };
  const moveMedia = (from: number, to: number) => {
    const files = mediaFiles.slice();
    const [moved] = files.splice(from, 1);
    files.splice(to, 0, moved);
    patchMedia({ mediaFiles: files });
    queueSave();
  };

  // ---------- Amenities ----------
  const toggleLibraryOption = (key: string) => {
    if (officeShop) update({ officeShopAmenitySelections: { ...form.officeShopAmenitySelections, [key]: form.officeShopAmenitySelections[key] !== true } });
    else update({ amenities: setAmenityChecked(form.amenities, key, !selectedAmenityKeys(category, form.amenities).includes(key)) });
  };
  const openLibrary = (trigger: HTMLButtonElement) => setLibrary({ open: true, trigger });
  const closeLibrary = useCallback(() => setLibrary((previous) => ({ ...previous, open: false })), []);

  // ---------- Policy document ----------
  const policyRef = latestRef(documentRefs, 'property_policy');
  const policyName = policyFile ? policyFile.name : policyRef ? policyRef.filename : existingPolicyUrl ? 'Property policy document' : null;
  const policyListingId = editListingId || (session ? session.listingId : null);

  const choosePolicy = (file: File) => {
    try { listingDocumentMimeType(file); } catch (error) {
      patchMedia({ policyFile: null });
      showMessage(errorMessage(error, 'Choose a PDF, JPEG, PNG, WebP, or GIF document.'), true);
      return;
    }
    patchMedia({ policyFile: file });
    queueSave();
  };

  const closePolicyPreview = useCallback(() => {
    setPolicyPreview((previous) => { if (previous && previous.src && previous.src.startsWith('blob:')) URL.revokeObjectURL(previous.src); return null; });
  }, []);

  const previewPolicy = async () => {
    if (policyFile) { closePolicyPreview(); setPolicyPreview({ filename: policyFile.name, src: URL.createObjectURL(policyFile) }); return; }
    if (!policyRef && !existingPolicyUrl) return;
    try {
      const result = await resolveCurrentPolicyPreview(policyListingId, await token());
      setPolicyPreview({ filename: result.filename, src: result.url });
    } catch (_) {
      setPolicyPreview({ filename: 'Document unavailable', src: null });
    }
  };

  const removePolicy = async () => {
    if (policyRemoving) return;
    closePolicyPreview();
    // An uploaded document is removed from the listing too (the name used to vanish while the document stayed attached).
    if (policyListingId && (policyRef || existingPolicyUrl)) {
      setPolicyRemoving(true);
      try {
        const result = await removeCurrentPolicyDocument(policyListingId, await token());
        patchMedia({ documentRefs: { ...latest.current.media.documentRefs, property_policy: result.formState.documentRefs }, policyFile: null });
        setExistingPolicyUrl(result.formState.existingPolicyUrl);
        queueSave();
        if (result.removed) showMessage('Property policy document removed.', false);
        else if (result.currentPolicy) showMessage('The policy changed while you were removing it. The currently attached document is shown.', false);
        else showMessage('This property policy document was already unavailable.', false);
      } catch (error) {
        showMessage(errorMessage(error, 'Unable to remove this policy document. Please try again.'), true);
      } finally {
        setPolicyRemoving(false);
      }
      return;
    }
    patchMedia({ policyFile: null });
    queueSave();
  };

  // ---------- Leaving ----------
  // Going Home (the app's sidebar: the logo, Home, My Listings) first asks to
  // save or discard the listing. The click is caught before the sidebar's own
  // handler, on the way down. Other links leave directly (the draft autosaves).
  const leaveGuard = useRef<{ active: boolean }>({ active: false });
  leaveGuard.current.active = !editMode && Boolean(userId) && ready;
  useEffect(() => {
    const guard = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const home = target?.closest<HTMLElement>('a[href="/host-home"], a[href^="/host-home?"], [data-nav="home"], [data-nav="my-listings"]');
      if (!home || home.closest('#listing-page')) return;
      event.preventDefault();
      event.stopPropagation();
      const href = home.getAttribute('data-nav') === 'my-listings' ? '/host-home?view=my-listings' : home.getAttribute('href') || '/host-home';
      setLeave({ open: true, stage: 'choose', destination: href, busy: null });
    };
    const onClick = (event: MouseEvent) => {
      if (!leaveGuard.current.active || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      guard(event);
    };
    // My Listings is a button-like row that opens on Enter without a click.
    const onKey = (event: KeyboardEvent) => {
      if (!leaveGuard.current.active || event.key !== 'Enter' || !(event.target instanceof Element) || event.target.closest('a')) return;
      guard(event);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); };
  }, []);
  const closeLeave = () => setLeave((previous) => ({ ...previous, open: false, stage: 'choose', busy: null }));

  const saveAndLeave = async () => {
    const current = sessionRef.current;
    if (!current) return;
    setLeave((previous) => ({ ...previous, busy: 'save' }));
    try {
      await current.documentQueue;
      await current.settled();
      const accessToken = await token();
      if (!accessToken) throw new Error('Please sign in again before saving this draft.');
      const listingId = await current.ensureShell(accessToken, () => shellPayload(latest.current.category, latest.current.form));
      await persistSelectedDocuments(listingId);
      await current.save(listingId);
      if (current.remoteUnavailable || current.revisionConflict) throw new Error('Your draft could not be saved to My Profile. Please try again before leaving.');
      current.finished = true;
      current.cancelTimer();
      closeLeave();
      void router.push(leave.destination);
    } catch (error) {
      closeLeave();
      showMessage(errorMessage(error, 'Unable to save or discard this draft. Your listing remains available to edit.'), true);
    }
  };

  const discardAndLeave = async () => {
    const current = sessionRef.current;
    if (!current || !userId) return;
    setLeave((previous) => ({ ...previous, busy: 'discard' }));
    try {
      if (flags.paymentVerified) throw new Error('A paid listing cannot be discarded. Save it as a draft or keep editing.');
      const accessToken = await token();
      if (!accessToken) throw new Error('Please sign in again before discarding this listing. Your draft is still saved.');
      current.finished = true;
      current.cancelTimer();
      await current.settled();
      // The shell goes first: its foreign key clears the draft's listing_id, so a failure never loses the only copy.
      if (current.listingId && !(await deleteListingShell(accessToken, current.listingId))) throw new Error('The unpublished listing shell could not be discarded safely.');
      if (current.draftId && !(await deleteRemoteDraft(accessToken, current.draftId))) throw new Error('The saved draft could not be removed from My Profile.');
      if (draftCache) {
        if (current.cacheKey) await draftCache.remove(current.cacheKey);
        draftCache.clearPointer(userId, current.cacheKey || undefined);
      }
      if (current.listingId) await current.clearCheckoutState(current.listingId);
      closeLeave();
      void router.push(leave.destination);
    } catch (error) {
      current.finished = false;
      closeLeave();
      showMessage(errorMessage(error, 'Unable to save or discard this draft. Your listing remains available to edit.'), true);
    }
  };

  // ---------- Silver / Gold, or a monthly plan ----------
  // VaRoom's checkout window over the wizard. Silver / Gold: M-Pesa or
  // Paystack's card popup. Airbnb, Hotel, Venue plans: card (Paystack renews
  // plans on cards). Once the server confirms the payment the choice closes
  // and the host carries on with the same draft.
  const startTierPayment = async (payment: ListingPayment) => {
    const accessToken = await token();
    if (!accessToken || !checkoutCard) throw new Error('Please log in again to continue.');
    if (!checkoutCard.perListing) return startCheckout(accessToken, checkoutCard.id);
    const current = sessionRef.current;
    // The card fallback (Paystack's own page) returns to this draft or listing.
    return startListingTierCheckout(accessToken, checkoutCard.id as ListingTier, payment, { draft: !editMode && current ? current.draftId : null, edit: editMode ? editListingId : null });
  };
  const confirmTierPayment = async (reference: string, waitingForPin: boolean): Promise<PaymentState> => {
    const accessToken = await token();
    if (!accessToken) throw new Error('Please log in again to continue.');
    if (checkoutCard && !checkoutCard.perListing) {
      const result = await checkReturnedPayment(accessToken, reference);
      return result.kind === 'active' ? 'paid' : result.kind === 'failed' ? 'failed' : 'pending';
    }
    return checkListingPayment(accessToken, reference, { waitingForPin });
  };
  const tierPaid = () => {
    const card = checkoutCard;
    setCheckoutCard(null);
    if (!card) return;
    if (!card.perListing) {
      setFlags((previous) => ({ ...previous, hasActiveNichePlan: true, planLimit: null }));
      showMessage(`Payment confirmed. Your ${card.name} plan is active: your listings stay online while it runs.`, false);
      return;
    }
    const tier = card.id as ListingTier;
    setFlags((previous) => ({ ...previous, listingCredits: { ...previous.listingCredits, [tier]: previous.listingCredits[tier] + 1 } }));
    showMessage(`Payment confirmed. Your ${card.name} listing is ready: fill in your listing and publish it. Its 30 days start when you publish.`, false);
  };
  // Before leaving for Paystack's own page: finish the draft save and keep autosave off.
  const beforeFullPagePayment = async () => {
    const current = sessionRef.current;
    if (!current) return;
    current.cancelTimer();
    await current.settled();
    current.checkoutHandoff = true;
  };

  // ---------- Publish ----------
  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (publishing.current || checkoutCard || !client || !userId) return;
    publishing.current = true;
    const current = sessionRef.current;
    try {
      // Every step again, in case the review was reached through the progress bar.
      for (let step = 1; step <= REVIEW_STEP; step += 1) if (!validateStep(step)) { goToStep(step); return; }
      const state = latest.current;
      const cat = state.category;
      const stateForm = state.form;
      if (isPaidNiche(cat) && !state.flags.hasActiveNichePlan && !state.flags.hasCurrentListingFee && !state.flags.paymentVerified && !hasListingCredit(state.flags)) {
        showMessage('Choose Silver or Gold before publishing this listing.', true);
        return;
      }
      // Airbnb, Hotel, Venue: online only while a plan runs (the server refuses without one too).
      if (isPlanNiche(cat) && !state.flags.hasActiveNichePlan && (!editMode || state.flags.listingNeedsPublication)) {
        showMessage(state.flags.planLimit ? 'Upgrade your plan, or pause a listing, before publishing this one.' : 'Choose a plan before publishing this listing.', true);
        return;
      }
      setPublishLabel(editMode ? 'Saving changes...' : 'Publishing...');
      const accessToken = await token();
      if (!accessToken) throw new Error('Please sign in again before publishing.');
      // A retry after a failure reuses the listing the first attempt created.
      const existingId = editMode ? editListingId : current ? current.listingId : null;
      const savedId = await saveListing(accessToken, existingId, listingPayload(cat, stateForm, !existingId));
      const listingId = (existingId || savedId) as string;
      if (current && !editMode) current.listingId = listingId;

      let officeDetails = officeShopDetailsFor(cat, stateForm, editOfficeDocs.current);
      if (officeDetails) {
        let refs = latest.current.media.documentRefs;
        const files = latest.current.media.officeShopFiles;
        const upload = async (file: File | null, type: string, label: string) => {
          if (!file) return;
          try { refs = (await uploadListingDocument(accessToken, file, type, listingId, refs)).refs; } catch (error) { throw new Error(`Could not upload ${label}: ${errorMessage(error, 'Upload failed')}`); }
        };
        await upload(files.floorPlan, 'floor_plan', 'floor plan');
        await upload(files.policy, 'commercial_policy', 'policy');
        for (const file of files.documents) await upload(file, 'ownership_management', 'ownership or management document');
        patchMedia({ documentRefs: refs });
        officeDetails = withOfficeShopDocuments(officeDetails, refs);
      }
      if (cat === 'property' && latest.current.media.policyFile) {
        setPublishLabel('Uploading policy document...');
        patchMedia({ documentRefs: (await uploadListingDocument(accessToken, latest.current.media.policyFile, 'property_policy', listingId, latest.current.media.documentRefs)).refs });
      }
      if (savesBookingDetails(cat, stateForm)) await saveBookingDetails(accessToken, listingId, bookingDetailsFor(cat, stateForm, editMode, officeDetails), editMode);
      const dining = diningBody(cat, stateForm);
      if (dining) await saveDiningConfig(accessToken, listingId, dining);


      const files = latest.current.media.mediaFiles;
      // Photos an earlier attempt already saved (before a reload or a reopened draft) aren't uploaded again.
      const onListing = await listingPhotoFingerprints(client, listingId);
      files.forEach((file) => { if (!isVideoFile(file) && onListing.has(photoFingerprint(file))) uploadedMedia.current.add(file); });
      const { uploadedCount, failedCount } = await uploadPendingMedia(files, uploadedMedia.current,
        (file, index) => (isVideoFile(file) ? uploadListingVideo(accessToken, file, listingId) : uploadListingPhoto(client, userId, file, listingId, index)),
        (index, total) => setPublishLabel(`Uploading media ${index + 1} of ${total}...`));
      if (mediaUploadBlocksPublish(editMode, files.length, failedCount)) {
        showMessage('Media upload failed, so the listing was not published. Your private draft and uploaded media are preserved; select Publish Listing to retry the remaining files.', true);
        setPublishLabel(null);
        return;
      }

      const now = latest.current.flags;
      if (shouldActivate({
        category: cat, editMode, paymentVerified: now.paymentVerified, hasActiveNichePlan: now.hasActiveNichePlan, hasCurrentListingFee: now.hasCurrentListingFee,
        hasListingCredit: hasListingCredit(now), listingIsPaused: now.listingIsPaused, listingNeedsPublication: now.listingNeedsPublication, listingIsMarked: now.listingIsMarked,
      })) {
        const activationToken = (await token()) || accessToken;
        await activateListing(activationToken, listingId);
        setFlags((previous) => ({ ...previous, listingIsPaused: false }));
      }

      if (current) { current.finished = true; current.cancelTimer(); await current.settled(); }
      if (!editMode && current && draftCache) {
        try {
          const pointer = draftCache.getPointer(userId);
          if (pointer && (pointer.cacheKey === current.cacheKey || (current.draftId && pointer.draftId === current.draftId)) && (!pointer.listingId || pointer.listingId === listingId)) {
            await draftCache.clearForHost(userId);
          }
        } catch (error) { console.error('Listing published, but the saved draft could not be fully cleared:', error); }
        try { await current.clearCheckoutState(listingId); } catch (error) { console.error('Listing is published, but its checkout save state could not be cleared:', error); }
      }
      if (current && current.draftId && !editMode) {
        try {
          const cleanupToken = await token();
          if (cleanupToken && !(await deleteRemoteDraft(cleanupToken, current.draftId))) console.error('Listing published, but its saved profile draft could not be cleared.');
        } catch (error) { console.error('Listing published, but its saved profile draft could not be cleared:', error); }
      }
      // The new listing belongs at the top of several cached feeds; mark them stale.
      const feed = getListingFeedCache();
      if (feed) feed.invalidateAll();

      let done = editMode ? 'Listing updated! Taking you back to your home page...' : 'Listing published! Taking you back to your home page...';
      if (files.length > 0) done += ` All ${uploadedCount} media item${uploadedCount === 1 ? '' : 's'} uploaded successfully.`;
      showMessage(done, false);
      setTimeout(() => { void router.push('/host-home'); }, 1400);
    } catch (error) {
      if (current && !editMode) current.finished = false;
      setPublishLabel(null);
      showMessage(`Something went wrong: ${errorMessage(error, 'Unable to publish listing. Please try again.')}`, true);
    } finally {
      publishing.current = false;
    }
  };

  // ---------- Review ----------
  const reviewMedia = editMode ? existingPhotos.map((photo) => ({ url: photo.url, video: false }))
    : mediaFiles.map((file) => ({ url: mediaUrls.get(file) || '', video: isVideoFile(file) }));
  const location = text(form.fields, 'location-text');
  // Neighbourhood and city are two boxes; together they make location_text ("Westlands, Nairobi").
  const area = listingAreaParts(form.fields);
  const setArea = (id: 'location-neighbourhood' | 'location-city', value: string) => {
    const next = { ...area, [id === 'location-neighbourhood' ? 'neighbourhood' : 'city']: value.replace(/,/g, ' ') };
    setFields({ [id]: next[id === 'location-neighbourhood' ? 'neighbourhood' : 'city'], 'location-text': joinListingArea(next.neighbourhood, next.city) });
  };
  const locationLine: ReviewLine = location
    ? { ok: true, text: 'General location added — exact location can be set later' }
    : { ok: false, text: 'General location still needed' };
  let amenitiesLine: ReviewLine;
  if (officeShop) {
    const chosen = Object.keys(form.officeShopAmenitySelections).filter((key) => form.officeShopAmenitySelections[key]);
    amenitiesLine = chosen.length ? { ok: true, text: 'Commercial amenities selected' } : { ok: 'optional', text: 'No commercial amenities selected' };
  } else {
    const selected = selectedAmenityKeys(category, form.amenities);
    const labels = amenityOptionsFor(category).filter((option) => selected.includes(option[0])).map((option) => option[1]);
    const prefix = category === 'hotel' ? 'Hotel amenities: ' : category === 'property' ? 'Property amenities: ' : 'Amenities: ';
    amenitiesLine = labels.length ? { ok: true, text: prefix + labels.join(' · ') }
      : { ok: false, text: category === 'hotel' ? 'Select room or hotel amenities' : category === 'property' ? 'Select property amenities' : 'Select amenities' };
  }
  const policyLine: ReviewLine | null = category !== 'property' ? null
    : policyFile ? { ok: true, text: `Property policy attached: ${policyFile.name}` }
      : policyRef ? { ok: true, text: `Property policy attached: ${policyRef.filename}` }
        : existingPolicyUrl ? { ok: true, text: 'Existing property policy attached' }
          : { ok: 'optional', text: 'Property policy document (optional, none attached)' };
  const officeShopSummary = officeShop ? [
    text(form.fields, 'os-subtype').replace(/_/g, ' '),
    text(form.fields, 'os-area') ? `${text(form.fields, 'os-area')} ${text(form.fields, 'os-area-unit').replace('_', ' ')}` : '',
    text(form.fields, 'os-price-amount') ? `KSh ${Number(text(form.fields, 'os-price-amount')).toLocaleString()}${unitLabel(priceUnit)}` : 'Price not provided',
    text(form.fields, 'os-available-from') ? `Available ${text(form.fields, 'os-available-from')}` : '',
  ].filter(Boolean).join(' · ') : '';

  const uploadedNames = {
    floorPlan: (documentRefs.floor_plan || []).map((ref) => ref.filename),
    policy: (documentRefs.commercial_policy || []).map((ref) => ref.filename),
    documents: (documentRefs.ownership_management || []).map((ref) => ref.filename),
  };

  const step = form.currentStep;
  const { showTierChoice, submitHidden, entitlementNote } = reviewActions(paymentNeeded, flags.entitlementChecked);
  // Over whichever step is showing (the first, for a new listing) until a paid listing is there to use.
  // Silver / Gold for Property and Shops & Offices; the niche's monthly plans for Airbnb, Hotel and Venue,
  // or, when all the listings a plan includes are online, that plan and the ones above it.
  const choiceCards = isPaidNiche(category) ? LISTING_TIER_CARDS
    : flags.planLimit ? upgradeCards(NICHE_PLAN_CARDS[category] || [], flags.planLimit.planId) : (NICHE_PLAN_CARDS[category] || []);
  const tierChoice = showTierChoice && !flags.publishBlocked && choiceCards.length
    ? <ListingTierChoice cards={choiceCards} limit={isPlanNiche(category) ? flags.planLimit : null} onChoose={setCheckoutCard} /> : null;
  const overlayFor = (n: number) => (step === n ? tierChoice : null);
  // Publishing uses the oldest paid Silver / Gold listing (activate_listing_with_entitlement).
  const { silver, gold } = flags.listingCredits;
  const creditNote = isPaidNiche(category) && !flags.hasActiveNichePlan && !flags.hasCurrentListingFee && !flags.paymentVerified && silver + gold > 0
    ? `Publishing uses your paid ${gold && !silver ? 'Gold' : silver && !gold ? 'Silver' : 'Silver or Gold'} listing. It stays live for 30 days from today.`
    : null;
  const submitLabel = publishLabel || (editMode ? 'Save changes' : 'Publish Listing');
  const officeProps = { kind, form, setField, update };

  return (
    <>
      <Head>
        <title>List your space — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: LIST_WIZARD_STYLES }} />
      {/* The app's dark theme (as on the other migrated pages); the wizard's own dark colours are in its styles. */}
      <link rel="stylesheet" href="/js/varoom-dark-theme.css" />
      <div className="checking-msg lw-checking" id="checking-auth" aria-live="polite" style={ready ? { display: 'none' } : undefined}>{checkingText}</div>

      <div className={`wizard${direction ? ` nav-${direction}` : ''}`} id="listing-page" data-listing-niche={ready ? category : undefined} style={{ display: ready ? 'block' : 'none' }}>
        <form id="list-form" ref={formRef} onSubmit={(event) => { void publish(event); }}>
          <div className="wizard-shell">
            <WizardProgress step={step} furthest={form.furthestStep} saveStatus={saveStatus} onGo={jumpTo} />

            {/* STEP 1 — About the property */}
            <StepFrame step={1} active={step === 1} overlay={overlayFor(1)}
              photo={<StepPhoto image={1} badge="Your listing, coming to life" title="Every space has a story." text="Introduce your space and show people what makes it worth discovering." />}>
              <h1 className="step-title" id="listing-headline">{copy.headline}</h1>
              <p className="step-sub" id="about-sub">{copy.aboutSub}</p>
              <OfficeShopTypeChoice category={category} onChoose={(choice) => { setOfficeShopTypeSelected(true); setCategory(choice); queueSave(); }} />
              {officeShop ? <OfficeShopDetails {...officeProps} /> : <div className="office-shop-section" id="office-shop-details-fields" />}
              <HotelModeChoice category={category} mode={form.hotelListingMode} onChoose={(mode: HotelMode) => update({ hotelListingMode: mode })} />
              <PropertyPurposeChoice category={category} purpose={form.propertyPurpose} onChoose={(purpose: PropertyPurpose) => update({ propertyPurpose: purpose })} />
              <IntroFields binding={binding} copy={copy} tableOnly={tableOnly} elie={{ category, facts: () => elieListingFacts(form, category) }} />
              <PanelActions next="Continue to location" onNext={next} alert={stepError && stepError.step === 1 ? stepError.text : null} />
            </StepFrame>

            {/* STEP 2 — Location */}
            <StepFrame step={2} active={step === 2} overlay={overlayFor(2)}
              photo={<StepPhoto image={2} badge="Location details added" title="Put your space on the map." text="Help people find your space with clear, accurate location details." />}>
              <h1 className="step-title" id="location-title">{copy.locationTitle}</h1>
              <p className="step-sub" id="location-sub">{copy.locationSub}</p>
              <div className="step-fields">
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="location-neighbourhood">Neighbourhood</label>
                    <input type="text" id="location-neighbourhood" required minLength={2} maxLength={80} autoComplete="address-level3" placeholder="e.g. Westlands"
                      value={area.neighbourhood} onChange={(event) => setArea('location-neighbourhood', event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="location-city">{category === 'property' ? 'Town or city' : 'City'}</label>
                    <input type="text" id="location-city" required minLength={2} maxLength={80} autoComplete="address-level2" placeholder="e.g. Nairobi"
                      value={area.city} onChange={(event) => setArea('location-city', event.target.value)} />
                  </div>
                </div>
                {officeShop ? <OfficeShopLocation {...officeProps} /> : <div className="office-shop-section" id="office-shop-location-fields" />}
              </div>
              <PanelActions onBack={back} next="Continue to the space" onNext={next} alert={stepError && stepError.step === 2 ? stepError.text : null} />
            </StepFrame>

            {/* STEP 3 — The space */}
            <StepFrame step={3} active={step === 3} overlay={overlayFor(3)}
              photo={(
                <StepPhoto image={5} badge="Details added" title="Show what it's like inside." text="The details people compare before they choose." ref={setStepPhoto3}>
                  <AmenitiesLibrary open={library.open} trigger={library.trigger} category={category} amenities={form.amenities} officeShopSelections={form.officeShopAmenitySelections}
                    onToggle={toggleLibraryOption} onClose={closeLibrary} desktopContainer={stepPhoto3} />
                </StepPhoto>
              )}>
              <h1 className="step-title" id="space-title">{copy.spaceTitle}</h1>
              <p className="step-sub" id="space-sub">{copy.spaceSub}</p>
              <div className="step-fields">
                {officeShop
                  ? <OfficeShopSpace {...officeProps} onOpenAmenities={openLibrary} />
                  : <SpaceFields binding={binding} copy={copy} category={category} hotelMode={form.hotelListingMode} />}
                <AmenitiesField category={category} amenities={form.amenities} hidden={officeShop || tableOnly}
                  onToggle={(key, on) => update({ amenities: setAmenityChecked(form.amenities, key, on) })} onOpenLibrary={openLibrary} />
              </div>
              <PanelActions onBack={back} next="Continue to photos" onNext={next} alert={stepError && stepError.step === 3 ? stepError.text : null} />
            </StepFrame>

            {/* STEP 4 — Photos */}
            <StepFrame step={4} active={step === 4} overlay={overlayFor(4)}
              photo={<StepPhoto image={3} badge="Gallery ready" title="Show what makes it special." text="Lead with your best photo. People decide in seconds." />}>
              <h1 className="step-title" id="media-title">{copy.mediaTitle}</h1>
              <p className="step-sub" id="media-sub">{copy.mediaSub}</p>
              <div className="step-fields" ref={dropzoneRef}>
                <MediaPicker files={mediaFiles} urls={mediaUrls} existingPhotos={existingPhotos} editMode={editMode} allowVideo={!videoNote} hint={copy.photoHint} error={photoError}
                  onAdd={addMedia} onRemove={removeMedia} onMove={moveMedia} onPreview={setLightbox} />
                {officeShop && (
                  <OfficeShopDocuments files={officeShopFiles} onFiles={(nextFiles: OfficeShopFiles) => { patchMedia({ officeShopFiles: nextFiles }); queueSave(); }}
                    uploadedNames={uploadedNames} existingDocuments={existingDocuments} onError={(message: string) => showMessage(message, true)} />
                )}
              </div>
              <PanelActions onBack={back} next="Continue to price" onNext={next} alert={stepError && stepError.step === 4 ? stepError.text : null} />
            </StepFrame>

            {/* STEP 5 — Price & terms */}
            <StepFrame step={5} active={step === 5} overlay={overlayFor(5)}
              photo={(
                <StepPhoto image={4} badge="Pricing set" title="Make every detail count." text="Clear terms mean fewer questions and faster bookings.">
                  <PolicyPreviewOverlay preview={policyPreview} onClose={closePolicyPreview} />
                </StepPhoto>
              )}>
              <h1 className="step-title" id="pricing-heading">{copy.pricingHeading}</h1>
              <p className="step-sub" id="booking-heading-sub">{copy.bookingSub}</p>
              <div className="price-preview">
                <span className="amount" id="price-preview-amount">{preview.amount}</span>
                <span className="unit" id="price-preview-unit">{preview.unit}</span>
              </div>
              <div className="step-fields">
                {officeShop ? <OfficeShopPricing {...officeProps} /> : <div className="office-shop-section" id="office-shop-pricing-fields" />}
                <BookingFields binding={binding} copy={copy} category={category} hotelMode={form.hotelListingMode} purpose={form.propertyPurpose} saleMode={form.propertySalePriceMode}
                  priceUnit={priceUnit} onSaleMode={(mode: SaleMode) => update({ propertySalePriceMode: mode })} onPriceEdit={(event) => (event.target as HTMLInputElement).setCustomValidity('')}
                  calendar={(
                    <div className="field">
                      <label>Availability</label>
                      <p className="booking-hint" id="availability-hint">
                        {copy.availabilityHint} {editListingId
                          ? <Link href={`/calendar?listing=${encodeURIComponent(editListingId)}`}>Open the calendar</Link>
                          : 'You can close days in Calendar once it’s published.'}
                      </p>
                    </div>
                  )} />
                <PolicyField hidden={category !== 'property'} filename={policyName} removing={policyRemoving} onChoose={choosePolicy} onPreview={() => { void previewPolicy(); }} onRemove={() => { void removePolicy(); }} />
              </div>
              <PanelActions onBack={back} next="Continue to review" onNext={next} alert={stepError && stepError.step === 5 ? stepError.text : null} />
            </StepFrame>

            {/* STEP 6 — Review & publish */}
            <StepFrame step={6} active={step === 6} overlay={overlayFor(6)}
              photo={<ReviewHero media={reviewMedia} index={reviewIndex} onIndex={setReviewIndex} />}>
              <h1 className="step-title">Ready when you are.</h1>
              <p className="step-sub">One last look, then it&apos;s live for people to see.</p>
              <div className="step-fields">
                <ReviewCard title={text(form.fields, 'title') || 'Untitled listing'}
                  meta={reviewMeta(category, form.propertyPurpose, location, text(form.fields, 'property-units-available'), text(form.fields, 'property-bedroom-type'), text(form.fields, 'property-bathrooms'))}
                  price={reviewPrice(category, form.propertyPurpose, form.propertySalePriceMode, amount, saleAmount, priceUnit)}
                  cover={reviewMedia[Math.min(reviewIndex, reviewMedia.length - 1)] || null} location={locationLine} amenities={amenitiesLine} policy={policyLine} />
                {officeShop ? <OfficeShopReview form={form} setField={setField} summary={officeShopSummary} /> : <div className="office-shop-section" id="office-shop-review-fields" />}
              </div>
              <StepAlert text={stepError && stepError.step === 6 ? stepError.text : null} />
              <div className="submit-row">
                <button type="submit" className="submit-btn" id="submit-btn" hidden={submitHidden} disabled={Boolean(publishLabel) || checkoutCard !== null || flags.publishBlocked}
                  title={flags.publishBlocked ? 'Restore the saved listing details before publishing.' : undefined}>
                  {publishLabel ? submitLabel : <>{submitLabel} <span>✓</span></>}
                </button>
                <p className="form-note" id="listing-entitlement-note" hidden={!entitlementNote}>
                  {entitlementNote ? 'Unable to confirm your listing allowance. Refresh this page to try again before publishing or paying.' : ''}
                </p>
                {creditNote && <p className="form-note" id="listing-tier-note">{creditNote}</p>}
                <p className="form-note">Goes live once saved, subject to GPS location verification.</p>
              </div>
              <PanelActions onBack={back} style={{ marginTop: '1rem' }} />
            </StepFrame>
          </div>
        </form>

        <div className={`success-msg${message ? ' show' : ''}${message && message.error ? ' error' : ''}`} id="success-msg" role="status" aria-live="polite" ref={messageRef}>
          <div className="inner">
            <span id="success-msg-inner">{message ? message.text : ''}</span>
            <button className="success-msg-close" id="success-msg-close" type="button" aria-label="Dismiss message" onClick={() => setMessage(null)}>&times;</button>
          </div>
        </div>
      </div>

      <PhotoLightbox item={lightbox} onClose={() => setLightbox(null)} />
      {checkoutCard && (
        <CheckoutWindow open allowMpesa={Boolean(checkoutCard.perListing)}
          item={{ name: `${checkoutCard.name} ${checkoutCard.perListing ? 'listing' : 'plan'}`, priceKes: checkoutCard.monthly,
            per: checkoutCard.perListing ? '/listing' : '/month', lines: checkoutCard.features }}
          paidText={checkoutCard.perListing ? 'Your listing plan is ready. Carry on with your listing.' : 'Your plan is active. Carry on with your listing.'}
          start={startTierPayment} confirm={confirmTierPayment} onPaid={tierPaid}
          onClose={() => setCheckoutCard(null)} onFallback={beforeFullPagePayment} />
      )}
      <LeaveDialog open={leave.open} stage={leave.stage} canDiscard={!flags.paymentVerified} busy={leave.busy}
        onStay={closeLeave} onSave={() => { void saveAndLeave(); }} onDiscard={() => setLeave((previous) => ({ ...previous, stage: 'confirm' }))}
        onConfirmDiscard={() => { void discardAndLeave(); }} onCancelDiscard={() => setLeave((previous) => ({ ...previous, stage: 'choose' }))} />
    </>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { getListingFeedCache } from '../lib/listingFeedCache';
import type { Category, FieldBinding, FieldValue, HotelMode, PropertyPurpose, SaleMode, WizardForm } from '../lib/listWizard/formState';
import { emptyForm, isOfficeShop, splitListingArea, text, checked } from '../lib/listWizard/formState';
import { payLabel, pricePreview, reviewMeta, reviewPrice, unitLabel, wizardCopy } from '../lib/listWizard/copy';
import { createListingDraftCache } from '../lib/listWizard/draftCache';
import type { DocumentRefs, WizardMedia } from '../lib/listWizard/drafts';
import { captureSnapshot } from '../lib/listWizard/drafts';
import {
  activateListing, addMediaFiles, deleteListingShell, deleteRemoteDraft, isVideoFile, latestRef, saveBookingDetails, saveDiningConfig, saveListing, startListingCheckout,
  uploadListingDocument, uploadListingPhoto, uploadListingVideo,
} from '../lib/listWizard/api';
import {
  bookingDetailsFor, diningBody, effectivePriceUnit, hasStayDetails, isPaidNiche, listingPayload, needsListingPayment, officeShopDetailsFor, savesBookingDetails,
  shellPayload, shouldActivate, withOfficeShopDocuments,
} from '../lib/listWizard/publish';
import type { PublicationState } from '../lib/listWizard/publish';
import { removeCurrentPolicyDocument, resolveCurrentPolicyPreview } from '../lib/listWizard/policyDocuments';
import type { OfficeShopFiles, OfficeShopKind } from '../lib/listWizard/officeShop';
import { listingDocumentMimeType, officeShopBusinessHoursError } from '../lib/listWizard/officeShop';
import { WizardSession } from '../lib/listWizard/wizardSession';
import { INITIAL_FLAGS, startWizard } from '../lib/listWizard/startup';
import type { Flags, Message } from '../lib/listWizard/startup';
import { selectedAmenityKeys, setAmenityChecked, amenityOptionsFor } from '../lib/listWizard/amenities';
import { LIST_WIZARD_STYLES } from '../components/listWizard/listWizardStyles';
import { WizardSidebar, WizardTopNav } from '../components/listWizard/WizardChrome';
import { INITIAL_SAVE_STATUS, PanelActions, StepFrame, StepPhoto } from '../components/listWizard/StepFrame';
import type { SaveStatus } from '../components/listWizard/StepFrame';
import { BookingFields, HotelModeChoice, IntroFields, OfficeShopTypeChoice, PropertyPurposeChoice } from '../components/listWizard/WizardFields';
import { MediaPicker, PhotoLightbox, useObjectUrls } from '../components/listWizard/MediaPicker';
import type { LightboxItem } from '../components/listWizard/MediaPicker';
import { AvailabilityCalendar } from '../components/listWizard/AvailabilityCalendar';
import { ReviewCard, ReviewHero } from '../components/listWizard/ReviewStep';
import type { ReviewLine } from '../components/listWizard/ReviewStep';
import { PolicyField, PolicyPreviewOverlay } from '../components/listWizard/PolicyDocument';
import type { PolicyPreviewState } from '../components/listWizard/PolicyDocument';
import { LeaveDialog } from '../components/listWizard/LeaveDialog';
import type { LeaveStage } from '../components/listWizard/LeaveDialog';
import { AmenitiesField, AmenitiesLibrary } from '../components/listWizard/AmenitiesLibrary';
import { OfficeShopDetails, OfficeShopLocation, OfficeShopMedia, OfficeShopPricing, OfficeShopReview } from '../components/listWizard/OfficeShopFields';
import type { ExistingListingDocument } from '../components/listWizard/OfficeShopFields';

// List a space (migrated from legacy-pages/list.html; also served at
// /properties): the five-step listing wizard for creating or editing
// (?edit=<id>) a listing. Drafts save to this device and to My Profile as the
// host types, a paid niche checks out through Paystack and comes back here
// to publish, and publishing returns to Host home without a reload.

const TOTAL_STEPS = 5;
const EMPTY_FILES: OfficeShopFiles = { floorPlan: null, policy: null, documents: [] };

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback;

const browserStorage = (): Storage | null => { try { return window.localStorage; } catch (_) { return null; } };

export default function ListPage() {
  const router = useRouter();
  const { status, user } = useAuth();
  const client = getSupabaseClient();
  const userId = user?.id || null;

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
  const [payBusy, setPayBusy] = useState<'pay' | 'pro' | null>(null);
  const [payLabelText, setPayLabelText] = useState<string | null>(null);
  const [correctionChoice, setCorrectionChoice] = useState(1);
  const [stepPhoto3, setStepPhoto3] = useState<HTMLDivElement | null>(null);

  const messageRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<WizardSession | null>(null);
  const publishing = useRef(false);
  const paying = useRef(false);
  /** Media already uploaded by an earlier publish attempt (a retry skips them). */
  const uploadedMedia = useRef(new Set<File>());
  /** The open dates already saved (edit mode, or a retried publish). */
  const savedDates = useRef<Set<string> | null>(null);
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
    return session && session.access_token && session.user.id === userId ? session.access_token : null;
  }, [client, userId]);

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
        const current = query.current;
        if (!current || current.edit || current.reference || !/\/list(?:\.html)?$/.test(window.location.pathname)) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('draft')) return;
        params.set('draft', draftId);
        void router.replace(`${window.location.pathname}?${params.toString()}`, undefined, { shallow: true, scroll: false });
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
  const update = useCallback((patch: Partial<WizardForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    queueSave();
  }, [queueSave]);
  const binding: FieldBinding = { fields: form.fields, setField };

  const goToStep = useCallback((target: number) => {
    const step = Math.max(1, Math.min(TOTAL_STEPS, target));
    setForm((previous) => ({ ...previous, currentStep: step, furthestStep: Math.max(previous.furthestStep, step) }));
    setCorrectionChoice(step);
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
    listingIsPaused: flags.listingIsPaused, listingNeedsPublication: flags.listingNeedsPublication,
  };
  const paymentNeeded = needsListingPayment(publication);
  const amount = text(form.fields, 'price-amount');
  const saleAmount = text(form.fields, 'property-sale-price');
  const preview = pricePreview(category, form.propertyPurpose, form.propertySalePriceMode, amount, saleAmount, priceUnit);

  // ---------- Validation (the browser's own messages, as before) ----------
  const frame = (step: number) => formRef.current?.querySelector<HTMLElement>(`.step-frame[data-step="${step}"]`) || null;
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const report = (input: HTMLInputElement | null, messageText: string) => {
    if (!input) return;
    input.setCustomValidity(messageText);
    input.reportValidity();
    input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
    input.focus();
  };

  const validateStep = (step: number): boolean => {
    const state = latest.current;
    const cat = state.category;
    const fields = state.form.fields;
    if (step === 2 && isOfficeShop(cat)) {
      const area = splitListingArea(text(fields, 'location-text'));
      if (!area.neighborhood || !area.city) {
        report(byId<HTMLInputElement>('location-text'), 'Enter the neighbourhood and city separated by a comma, for example Westlands, Nairobi.');
        return false;
      }
    }
    if (step === 1 && isOfficeShop(cat) && !officeShopTypeSelected) {
      formRef.current?.querySelector<HTMLButtonElement>('[data-office-shop-type]')?.focus();
      window.alert('Choose whether you are listing an Office or a Shop.');
      return false;
    }
    if (step === 1 && cat === 'hotel' && !state.form.hotelListingMode) {
      formRef.current?.querySelector<HTMLButtonElement>('[data-hotel-mode]')?.focus();
      window.alert('Choose whether this hotel offers stays, table reservations, or both.');
      return false;
    }
    if (step === 4 && cat === 'property') {
      const purpose = state.form.propertyPurpose;
      const checks: string[] = purpose === 'sale' ? ['property-sale-price'] : purpose === 'both' ? ['price-amount', 'property-sale-price'] : ['price-amount'];
      for (const id of checks) {
        const value = text(fields, id);
        if (!value || Number(value) <= 0) {
          const input = byId<HTMLInputElement>(id);
          // An empty field gets the browser's "required" message; 0 used to pass silently.
          if (value) report(input, 'Enter a price greater than 0.');
          else if (input) { input.focus(); input.reportValidity(); }
          return false;
        }
      }
    }
    if (step === 3 && isOfficeShop(cat)) {
      const hoursError = officeShopBusinessHoursError(fields, cat as OfficeShopKind);
      if (hoursError) { report(byId<HTMLInputElement>('os-operating-hours-to'), hoursError); return false; }
      if (state.media.mediaFiles.length === 0 && existingPhotos.length === 0) {
        setPhotoError('Add at least one photo or video of the actual unit before continuing.');
        dropzoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    }
    if (step === 5 && isOfficeShop(cat) && !checked(fields, 'os-accuracy-confirmed')) {
      const accuracy = byId<HTMLInputElement>('os-accuracy-confirmed');
      if (accuracy) { accuracy.focus(); accuracy.reportValidity(); }
      window.alert('Confirm that availability and pricing are accurate today before publishing.');
      return false;
    }
    const element = frame(step);
    if (!element) return true;
    for (const field of Array.from(element.querySelectorAll<HTMLInputElement>('[required]'))) {
      if (!field.checkValidity()) { field.reportValidity(); return false; }
    }
    return true;
  };

  const next = () => { if (validateStep(form.currentStep)) goToStep(form.currentStep + 1); };
  const back = () => goToStep(form.currentStep - 1);

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

  /** Everything a checkout needs saved first (persistBeforeCheckout). */
  const persistBeforeCheckout = useCallback(async (accessToken: string, saveProfileDraft: boolean): Promise<string> => {
    const current = sessionRef.current;
    if (!current) throw new Error('Please log in again to continue.');
    current.cancelTimer();
    const handoff = !saveProfileDraft;
    if (handoff) current.checkoutHandoff = true;
    try {
      await current.settled();
      await current.documentQueue;
      const listingId = await current.ensureShell(accessToken, () => shellPayload(latest.current.category, latest.current.form));
      await persistSelectedDocuments(listingId);
      try { await current.saveCheckoutState(listingId); } catch (error) {
        console.error('Unable to persist the listing checkout state:', error);
        throw new Error('Your listing could not be safely saved for checkout. No payment was started. Please try again or contact support.');
      }
      await current.save(listingId);
      if (current.revisionConflict) setSaveStatus({ message: 'Checkout save is ready. The saved profile copy will sync after this listing returns.', state: 'error' });
      if (current.remoteUnavailable) setSaveStatus({ message: 'Checkout save is ready. Profile sync will resume when connected.', state: 'error' });
      return listingId;
    } catch (error) {
      if (handoff) current.checkoutHandoff = false;
      throw error;
    }
  }, [persistSelectedDocuments]);

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
        setCorrectionChoice(outcome.form.currentStep);
      }
      if (outcome.edit) {
        setExistingPhotos(outcome.edit.existingPhotos);
        setExistingPolicyUrl(outcome.edit.existingPolicyUrl);
        if (isOfficeShop(outcome.category)) setExistingDocuments(outcome.edit.documents as ExistingListingDocument[]);
        editOfficeDocs.current = outcome.edit.officeShopDocuments;
        savedDates.current = new Set(outcome.edit.savedDates);
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
  const addMedia = (incoming: File[]) => {
    if (editMode) return;
    const result = addMediaFiles(latest.current.media.mediaFiles, incoming);
    setPhotoError(result.error);
    patchMedia({ mediaFiles: result.files });
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
  const onLeave = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (editMode || !userId || !ready) return;
    event.preventDefault();
    setLeave({ open: true, stage: 'choose', destination: href, busy: null });
  };
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

  // ---------- Pay to list / Go Pro ----------
  const validateUpTo = (last: number) => {
    for (let step = 1; step <= last; step += 1) if (!validateStep(step)) { goToStep(step); return false; }
    return true;
  };

  const payToList = async () => {
    if (paying.current || publishing.current) return;
    if (!validateUpTo(4)) return;
    paying.current = true;
    setPayBusy('pay');
    setPayLabelText('Preparing payment…');
    let redirected = false;
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Please log in again to continue.');
      const listingId = await persistBeforeCheckout(accessToken, false);
      const url = await startListingCheckout(accessToken, listingId);
      setPayLabelText('Opening secure checkout…');
      showMessage('Opening secure Paystack checkout. Your listing remains a saved draft until payment is verified and you select Publish Listing.', false);
      // Same tab: Paystack returns here, and the payment is verified before Publish Listing shows.
      window.location.assign(url);
      redirected = true;
    } catch (error) {
      showMessage(errorMessage(error, 'Unable to start payment. Please try again.'), true);
    } finally {
      paying.current = false;
      if (!redirected && sessionRef.current) sessionRef.current.checkoutHandoff = false;
      if (!redirected) { setPayBusy(null); setPayLabelText(null); }
    }
  };

  const goPro = async () => {
    if (paying.current || publishing.current) return;
    paying.current = true;
    setPayBusy('pro');
    try {
      if (!validateUpTo(4)) return;
      const accessToken = await token();
      if (!accessToken) throw new Error('Please log in again to continue.');
      await persistBeforeCheckout(accessToken, true);
      if (sessionRef.current) { sessionRef.current.finished = true; sessionRef.current.cancelTimer(); }
      void router.push(`/pricing?niche=${encodeURIComponent(category)}&returnTo=list`);
    } catch (error) {
      showMessage(errorMessage(error, 'Unable to save your listing before checkout.'), true);
    } finally {
      paying.current = false;
      setPayBusy(null);
    }
  };

  // ---------- Publish ----------
  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (publishing.current || paying.current || !client || !userId) return;
    publishing.current = true;
    const current = sessionRef.current;
    try {
      // Every step again, in case step 5 was reached through the tracker.
      for (let step = 1; step <= 5; step += 1) if (!validateStep(step)) { goToStep(step); return; }
      const state = latest.current;
      const cat = state.category;
      const stateForm = state.form;
      if (isPaidNiche(cat) && !state.flags.hasActiveNichePlan && !state.flags.hasCurrentListingFee && !state.flags.paymentVerified) {
        showMessage('Choose Pay KSh 1,000 or Go Pro before publishing this listing.', true);
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

      if (hasStayDetails(cat, stateForm)) {
        const open = new Set(stateForm.availableDates);
        const saved = savedDates.current;
        if (saved) {
          const removed = Array.from(saved).filter((date) => !open.has(date));
          const added = Array.from(open).filter((date) => !saved.has(date));
          if (removed.length) {
            const { error } = await client.from('availability').delete().eq('listing_id', listingId).in('date', removed);
            if (error) throw error;
          }
          if (added.length) {
            const { error } = await client.from('availability').insert(added.map((date) => ({ listing_id: listingId, date })));
            if (error) throw error;
          }
        } else if (open.size) {
          const { error } = await client.from('availability').insert(Array.from(open).map((date) => ({ listing_id: listingId, date })));
          if (error) throw error;
        }
        savedDates.current = open;
      }

      const files = latest.current.media.mediaFiles;
      let uploadedCount = 0;
      let failedCount = 0;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setPublishLabel(`Uploading media ${index + 1} of ${files.length}...`);
        if (uploadedMedia.current.has(file)) { uploadedCount += 1; continue; }
        try {
          if (isVideoFile(file)) await uploadListingVideo(accessToken, file, listingId);
          else await uploadListingPhoto(client, userId, file, listingId, index);
          uploadedMedia.current.add(file);
          uploadedCount += 1;
        } catch (error) {
          console.warn('Listing media upload failed:', error);
          failedCount += 1;
        }
      }
      if (!editMode && files.length > 0 && failedCount > 0) {
        showMessage('Media upload failed, so the listing was not published. Your private draft and uploaded media are preserved; select Publish Listing to retry the remaining files.', true);
        setPublishLabel(null);
        return;
      }

      const now = latest.current.flags;
      if (shouldActivate({
        category: cat, editMode, paymentVerified: now.paymentVerified, hasActiveNichePlan: now.hasActiveNichePlan, hasCurrentListingFee: now.hasCurrentListingFee,
        listingIsPaused: now.listingIsPaused, listingNeedsPublication: now.listingNeedsPublication,
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
  const showPay = paymentNeeded && flags.entitlementChecked;
  const submitHidden = paymentNeeded;
  const payDisabled = payBusy !== null;
  const submitLabel = publishLabel || (editMode ? 'Save changes' : 'Publish Listing');
  const officeProps = { kind, form, setField, update };

  return (
    <>
      <Head>
        <title>List your space — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&family=Roboto+Condensed:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: LIST_WIZARD_STYLES }} />
      {/* The dark theme came after these styles in list.html and wins ties (inputs, selects); keep that order. Same cached file as _app's. */}
      <link rel="stylesheet" href="/js/varoom-dark-theme.css" />
      <div className="checking-msg" id="checking-auth" aria-live="polite" style={ready ? { display: 'none' } : undefined}>{checkingText}</div>

      <div className="wizard" id="listing-page" data-listing-niche={ready ? category : undefined} style={{ display: ready ? 'block' : 'none' }}>
        <WizardSidebar onLeave={onLeave} />
        <WizardTopNav onLeave={onLeave} />
        <form id="list-form" ref={formRef} onSubmit={(event) => { void publish(event); }}>
          <div className="wizard-shell">
            <div className="wizard-correction-nav" aria-label="Edit an earlier step">
              <label htmlFor="correction-step">Need to correct something?</label>
              <select id="correction-step" value={String(Math.min(correctionChoice, form.furthestStep))} onChange={(event) => setCorrectionChoice(Number(event.target.value))}>
                {['1. Listing details', '2. Location', '3. Media & amenities', '4. Pricing & booking', '5. Review'].map((label, index) => (
                  <option key={label} value={index + 1} disabled={index + 1 > form.furthestStep}>{label}</option>
                ))}
              </select>
              <button type="button" id="correction-step-go" onClick={() => { if (correctionChoice <= form.furthestStep) goToStep(correctionChoice); }}>Edit</button>
            </div>

            {/* STEP 1 — About the property */}
            <StepFrame step={1} tone="tone-dark" active={step === 1} pct={20} saveStatus={saveStatus}
              progress={<><span className="step-count">01/5</span><br /><span id="progress-step-label">Listing Introduction</span></>}
              photo={<StepPhoto step={1} badge="Your listing, coming to life" title="Every space has a story." text="Introduce your space and show people what makes it worth discovering." />}>
              <p className="step-eyebrow" id="about-eyebrow">{copy.aboutEyebrow}</p>
              <h1 className="step-title" id="listing-headline">{copy.headline}</h1>
              <p className="step-sub" id="about-sub">{copy.aboutSub}</p>
              <OfficeShopTypeChoice category={category} onChoose={(choice) => { setOfficeShopTypeSelected(true); setCategory(choice); queueSave(); }} />
              {officeShop ? <OfficeShopDetails {...officeProps} /> : <div className="office-shop-section" id="office-shop-details-fields" />}
              <HotelModeChoice category={category} mode={form.hotelListingMode} onChoose={(mode: HotelMode) => update({ hotelListingMode: mode })} />
              <PropertyPurposeChoice category={category} purpose={form.propertyPurpose} onChoose={(purpose: PropertyPurpose) => update({ propertyPurpose: purpose })} />
              <IntroFields binding={binding} copy={copy} tableOnly={tableOnly} />
              <PanelActions next="Continue to location →" onNext={next} />
            </StepFrame>

            {/* STEP 2 — Location */}
            <StepFrame step={2} tone="tone-dark" active={step === 2} pct={40} saveStatus={saveStatus}
              progress={<><span className="step-count">02/05</span><br />Location</>}
              photo={<StepPhoto step={2} badge="Location details added" title="Put your space on the map." text="Help people find your space with clear, accurate location details." />}>
              <p className="step-eyebrow">02 — Location</p>
              <h1 className="step-title" id="location-title">{copy.locationTitle}</h1>
              <p className="step-sub" id="location-sub">{copy.locationSub}</p>
              <div className="step-fields">
                <div className="field">
                  <label htmlFor="location-text" id="location-label">{copy.locationLabel}</label>
                  <input type="text" id="location-text" name="location_text" required minLength={3} autoComplete="address-level2" placeholder={copy.locationPlaceholder}
                    value={text(form.fields, 'location-text')} onChange={(event) => { event.target.setCustomValidity(''); setField('location-text', event.target.value); }} />
                </div>
                {officeShop ? <OfficeShopLocation {...officeProps} /> : <div className="office-shop-section" id="office-shop-location-fields" />}
              </div>
              <PanelActions onBack={back} next="continue to media & amenities →" onNext={next} />
            </StepFrame>

            {/* STEP 3 — Photos & gallery */}
            <StepFrame step={3} tone="tone-dark" active={step === 3} pct={60} saveStatus={saveStatus}
              progress={<><span className="step-count">03/05</span><br />media &amp; amenities</>}
              photo={(
                <StepPhoto step={3} badge="Gallery ready" title="Show what makes it special." text="Bring your space to life with photos, videos, and the details that matter." ref={setStepPhoto3}>
                  <AmenitiesLibrary open={library.open} trigger={library.trigger} category={category} amenities={form.amenities} officeShopSelections={form.officeShopAmenitySelections}
                    onToggle={toggleLibraryOption} onClose={closeLibrary} desktopContainer={stepPhoto3} />
                  <PolicyPreviewOverlay preview={policyPreview} onClose={closePolicyPreview} />
                </StepPhoto>
              )}>
              <p className="step-eyebrow">03 — Photos</p>
              <h1 className="step-title" id="media-title">{copy.mediaTitle}</h1>
              <p className="step-sub" id="media-sub">{copy.mediaSub}</p>
              <div className="step-fields" ref={dropzoneRef}>
                <MediaPicker files={mediaFiles} urls={mediaUrls} existingPhotos={existingPhotos} editMode={editMode} hint={copy.photoHint} error={photoError}
                  onAdd={addMedia} onRemove={removeMedia} onMove={moveMedia} onPreview={setLightbox} />
                <AmenitiesField category={category} amenities={form.amenities} hidden={officeShop || tableOnly}
                  onToggle={(key, on) => update({ amenities: setAmenityChecked(form.amenities, key, on) })} onOpenLibrary={openLibrary} />
                {officeShop ? (
                  <OfficeShopMedia {...officeProps} files={officeShopFiles} onFiles={(nextFiles) => { patchMedia({ officeShopFiles: nextFiles }); queueSave(); }}
                    uploadedNames={uploadedNames} existingDocuments={existingDocuments} onOpenAmenities={openLibrary} onError={(text) => showMessage(text, true)} />
                ) : <div className="office-shop-section" id="office-shop-media-fields" />}
                <PolicyField hidden={category !== 'property'} filename={policyName} removing={policyRemoving} onChoose={choosePolicy} onPreview={() => { void previewPolicy(); }} onRemove={() => { void removePolicy(); }} />
              </div>
              <PanelActions onBack={back} next="Continue to pricing →" onNext={next} />
            </StepFrame>

            {/* STEP 4 — Pricing & booking */}
            <StepFrame step={4} tone="tone-red" active={step === 4} pct={80} saveStatus={saveStatus}
              progress={<><span className="step-count">04 / 05</span><br />Set the terms</>}
              photo={<StepPhoto step={4} badge="Pricing set" title="Make every detail count." text="Set clear terms so people know what to expect when booking or renting your space." />}>
              <p className="step-eyebrow">04 — Pricing &amp; booking</p>
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
                  calendar={<AvailabilityCalendar hint={copy.availabilityHint} openDates={form.availableDates} onChange={(dates) => update({ availableDates: dates })} />} />
              </div>
              <PanelActions onBack={back} next="Continue to review →" onNext={next} />
            </StepFrame>

            {/* STEP 5 — Review & publish */}
            <StepFrame step={5} tone="tone-cream" active={step === 5} pct={100} saveStatus={saveStatus}
              progress={<><span className="step-count">05 / 05</span><br />Last look, then live</>}
              photo={<ReviewHero media={reviewMedia} />}>
              <p className="step-eyebrow">05 — Review &amp; publish</p>
              <h1 className="step-title">Ready when you are.</h1>
              <p className="step-sub">One last look, then it&apos;s live for people to see.</p>
              <div className="step-fields">
                <ReviewCard title={text(form.fields, 'title') || 'Untitled listing'}
                  meta={reviewMeta(category, form.propertyPurpose, location, text(form.fields, 'property-units-available'), text(form.fields, 'property-bedroom-type'), text(form.fields, 'property-bathrooms'))}
                  price={reviewPrice(category, form.propertyPurpose, form.propertySalePriceMode, amount, saleAmount, priceUnit)}
                  cover={reviewMedia[0] || null} location={locationLine} amenities={amenitiesLine} policy={policyLine} />
                {officeShop ? <OfficeShopReview form={form} setField={setField} summary={officeShopSummary} /> : <div className="office-shop-section" id="office-shop-review-fields" />}
              </div>
              <div className="submit-row">
                <button type="button" className="pay-to-list-btn" id="pay-to-list-btn" hidden={!showPay} disabled={payDisabled} onClick={(event) => { event.preventDefault(); void payToList(); }}>
                  {payBusy === 'pay' && payLabelText ? payLabelText : payLabel()}
                </button>
                <button type="button" className="submit-btn" id="go-pro-btn" hidden={!showPay} disabled={payDisabled} onClick={(event) => { event.preventDefault(); void goPro(); }}>
                  {payBusy === 'pro' ? 'Saving your listing…' : 'Go Pro'}
                </button>
                <button type="submit" className="submit-btn" id="submit-btn" hidden={submitHidden} disabled={Boolean(publishLabel) || payBusy === 'pay' || flags.publishBlocked}
                  title={flags.publishBlocked ? 'Restore the saved listing details before publishing.' : undefined}>
                  {publishLabel ? submitLabel : <>{submitLabel} <span>✓</span></>}
                </button>
                <p className="form-note" id="listing-entitlement-note" hidden={!(paymentNeeded && !flags.entitlementChecked)}>
                  {paymentNeeded && !flags.entitlementChecked ? 'Unable to confirm your listing allowance. Refresh this page to try again before publishing or paying.' : ''}
                </p>
                <p className="form-note">Goes live once saved, subject to GPS location verification.</p>
              </div>
              <PanelActions onBack={back} style={{ marginTop: '1rem' }} />
            </StepFrame>
          </div>
        </form>

        <div className="step-tracker" id="step-tracker">
          {['About the property', 'Location & verification', 'Photos & gallery', 'Pricing & booking', 'Review & publish'].map((label, index) => {
            const target = index + 1;
            return (
              <div key={label} className={`tracker-item${target === step ? ' active' : ''}${target < form.furthestStep || target < step ? ' completed' : ''}`} data-step-link={target}
                onClick={() => { if (target <= form.furthestStep) goToStep(target); }}>
                <span className="t-num">0{target}</span><span className="t-label">{label}</span>
              </div>
            );
          })}
        </div>

        <div className={`success-msg${message ? ' show' : ''}${message && message.error ? ' error' : ''}`} id="success-msg" role="status" aria-live="polite" ref={messageRef}>
          <div className="inner">
            <span id="success-msg-inner">{message ? message.text : ''}</span>
            <button className="success-msg-close" id="success-msg-close" type="button" aria-label="Dismiss message" onClick={() => setMessage(null)}>&times;</button>
          </div>
        </div>
      </div>

      <PhotoLightbox item={lightbox} onClose={() => setLightbox(null)} />
      <LeaveDialog open={leave.open} stage={leave.stage} canDiscard={!flags.paymentVerified} busy={leave.busy}
        onStay={closeLeave} onSave={() => { void saveAndLeave(); }} onDiscard={() => setLeave((previous) => ({ ...previous, stage: 'confirm' }))}
        onConfirmDiscard={() => { void discardAndLeave(); }} onCancelDiscard={() => setLeave((previous) => ({ ...previous, stage: 'choose' }))} />
    </>
  );
}
